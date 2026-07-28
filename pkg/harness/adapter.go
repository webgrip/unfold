package harness

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"os"
	"os/exec"

	"github.com/webgrip/ploeg/pkg/work"
)

// Adapter is the harness seam: one Run per claim. The orchestrator
// (pkg/worker) owns everything around it — claim/lease/outcome reporting,
// git clone and identity, credential lifecycle, and PR-based outcome
// detection (the forge is ground truth for every harness, so outcome
// inference by PR poll lives OUTSIDE the adapter).
//
// ctx cancellation means the lease is lost: the adapter must kill its
// harness and return promptly.
//
// Session-protocol harnesses (ACP, backlog #64) implement Adapter
// directly; spawn-and-wait harnesses implement CommandAdapter and are
// lifted by RunCommand.
type Adapter interface {
	Name() string
	Run(ctx context.Context, spec TaskSpec, env RunEnv) (OutcomeReport, error)
}

// RunEnv is everything the orchestrator provisions for one run.
type RunEnv struct {
	RepoDir    string // clone with git identity already configured; the harness's working directory
	ScratchDir string // task files, outcome artifacts
	Prompt     string // Ploeg's delivery-contract prompt (composed by the orchestrator, not the harness)
	BaseEnv    []string
	LLM        LLMEnv
	Stdout     io.Writer // pod log passthrough
	Stderr     io.Writer
	Checkpoint func(work.Checkpoint) // best-effort progress reporting; may be nil
	Log        *slog.Logger
}

// LLMEnv is the harness-neutral LLM wiring for one run. Adapters translate
// it into harness-native env names (LLM_* for OpenHands, ANTHROPIC_* for
// Claude Code). The same values are also present in BaseEnv under the LLM_*
// names for harnesses that read them directly.
type LLMEnv struct {
	APIKey  string // per-run minted key; "" = the harness image authenticates itself
	BaseURL string // OpenAI-compatible base URL (LLM_BASE_URL passthrough)
	Model   string // model name with proxy prefixes stripped
	TraceID string // ploeg-<12hex>
}

// CommandAdapter is the spawn-and-wait sub-contract: prepare task input,
// hand back one invocation, interpret the process result. RunCommand lifts
// it to Adapter.
type CommandAdapter interface {
	Name() string
	// Prepare writes harness-specific task input (under env.ScratchDir) and
	// returns the invocation to exec in env.RepoDir.
	Prepare(spec TaskSpec, env RunEnv) (Invocation, error)
	// ParseOutcome maps the process result to a report. Return the zero
	// value to signal "no structured output" — the orchestrator then falls
	// back to forge ground truth and exit-code heuristics.
	ParseOutcome(spec TaskSpec, res ExecResult) (OutcomeReport, error)
}

// Invocation is one harness process to run.
type Invocation struct {
	Argv     []string // argv[0] = binary on PATH or absolute path
	ExtraEnv []string // appended to RunEnv.BaseEnv
	// OutcomeFile optionally names a file the harness is expected to write
	// its OutcomeReport JSON to; RunCommand stats it into ExecResult.
	OutcomeFile string
	// CaptureStdout buffers the process stdout (bounded) into
	// ExecResult.Stdout for adapters that parse a structured result
	// envelope. Output still passes through to RunEnv.Stdout either way.
	CaptureStdout bool
}

// ExecResult is what a finished harness process left behind.
type ExecResult struct {
	ExitCode    int
	Err         error  // exec error (incl. ctx cancellation), nil on exit 0
	LogTail     []byte // last 8 KiB of combined output
	Stdout      []byte // captured stdout when Invocation.CaptureStdout, else nil
	OutcomeFile string // Invocation.OutcomeFile if declared AND present, else ""
}

// maxCapturedStdout bounds ExecResult.Stdout so a runaway harness cannot
// exhaust worker memory.
const maxCapturedStdout = 1 << 20 // 1 MiB

// RunCommand lifts a CommandAdapter to Adapter: exec the invocation in
// RepoDir, tee output into an 8 KiB tail, then hand the result to
// ParseOutcome. A ParseOutcome error downgrades to "no structured signal"
// (logged), never masks the exec error.
func RunCommand(ca CommandAdapter) Adapter { return commandRunner{ca} }

type commandRunner struct{ ca CommandAdapter }

func (r commandRunner) Name() string { return r.ca.Name() }

func (r commandRunner) Run(ctx context.Context, spec TaskSpec, env RunEnv) (OutcomeReport, error) {
	inv, err := r.ca.Prepare(spec, env)
	if err != nil {
		return OutcomeReport{}, err
	}
	if len(inv.Argv) == 0 {
		return OutcomeReport{}, errEmptyArgv
	}

	cmd := exec.CommandContext(ctx, inv.Argv[0], inv.Argv[1:]...)
	cmd.Dir = env.RepoDir
	cmd.Env = append(append([]string{}, env.BaseEnv...), inv.ExtraEnv...)

	var tail TailBuffer
	stdout := io.MultiWriter(nonNil(env.Stdout), &tail)
	var captured *limitBuffer
	if inv.CaptureStdout {
		captured = &limitBuffer{max: maxCapturedStdout}
		stdout = io.MultiWriter(nonNil(env.Stdout), &tail, captured)
	}
	cmd.Stdout = stdout
	cmd.Stderr = io.MultiWriter(nonNil(env.Stderr), &tail)

	runErr := cmd.Run()

	res := ExecResult{ExitCode: -1, Err: runErr, LogTail: tail.Bytes()}
	if cmd.ProcessState != nil {
		res.ExitCode = cmd.ProcessState.ExitCode()
	}
	if captured != nil {
		res.Stdout = captured.buf.Bytes()
	}
	if inv.OutcomeFile != "" {
		if _, statErr := os.Stat(inv.OutcomeFile); statErr == nil {
			res.OutcomeFile = inv.OutcomeFile
		}
	}

	report, parseErr := r.ca.ParseOutcome(spec, res)
	if parseErr != nil {
		if env.Log != nil {
			env.Log.Warn("harness outcome parse failed; falling back to heuristics",
				"adapter", r.ca.Name(), "err", parseErr)
		}
		return OutcomeReport{}, runErr
	}
	return report, runErr
}

type harnessError string

func (e harnessError) Error() string { return string(e) }

const errEmptyArgv = harnessError("harness adapter returned an empty argv")

func nonNil(w io.Writer) io.Writer {
	if w == nil {
		return io.Discard
	}
	return w
}

// TailBuffer keeps the last 8 KiB written — enough for a stuck reason.
type TailBuffer struct{ buf []byte }

func (t *TailBuffer) Write(p []byte) (int, error) {
	t.buf = append(t.buf, p...)
	if len(t.buf) > 8192 {
		t.buf = t.buf[len(t.buf)-8192:]
	}
	return len(p), nil
}
func (t *TailBuffer) Bytes() []byte { return t.buf }

// limitBuffer keeps the first max bytes written and drops the rest.
type limitBuffer struct {
	buf bytes.Buffer
	max int
}

func (l *limitBuffer) Write(p []byte) (int, error) {
	if room := l.max - l.buf.Len(); room > 0 {
		if len(p) > room {
			l.buf.Write(p[:room])
		} else {
			l.buf.Write(p)
		}
	}
	return len(p), nil
}
