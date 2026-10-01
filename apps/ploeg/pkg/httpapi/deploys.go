package httpapi

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/webgrip/ploeg/pkg/provider"
	"github.com/webgrip/ploeg/pkg/store"
	"github.com/webgrip/ploeg/pkg/work"
)

// DeployAuth holds, as a hash, the bearer credential POST /api/v1/deploys
// accepts (ADR-0047).
type DeployAuth struct {
	hash [sha256.Size]byte
}

// NewDeployAuth returns the authentication for token. An empty token returns
// nil, which disables the endpoint. A token shorter than 32 bytes, longer
// than 4096 bytes or containing whitespace is an error.
func NewDeployAuth(token string) (*DeployAuth, error) {
	if token == "" {
		return nil, nil
	}
	if len(token) < 32 || len(token) > 4096 || strings.ContainsAny(token, " \t\r\n,") {
		return nil, errors.New("the deploy token must be 32 to 4096 bytes without whitespace or commas")
	}
	return &DeployAuth{hash: sha256.Sum256([]byte(token))}, nil
}

func (a *DeployAuth) allows(r *http.Request) bool {
	values := r.Header.Values("Authorization")
	if len(values) != 1 {
		return false
	}
	scheme, credential, ok := strings.Cut(values[0], " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") || credential == "" || len(credential) > 4096 {
		return false
	}
	got := sha256.Sum256([]byte(credential))
	return subtle.ConstantTimeCompare(got[:], a.hash[:]) == 1
}

const (
	deployBodyLimit      = 16 << 10
	deployCandidateLimit = 50
	deployMergeSkew      = 10 * time.Minute
	deployFutureSkew     = 5 * time.Minute
	deployCheckTimeout   = 20 * time.Second
)

var (
	deployForge = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$`)
	deployOwner = regexp.MustCompile(`^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$`)
	deployName  = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,255}$`)
	deploySHA   = regexp.MustCompile(`^([0-9a-f]{40}|[0-9a-f]{64})$`)
)

type deployRequest struct {
	Environment string `json:"environment"`
	Repo        struct {
		Forge string `json:"forge"`
		Owner string `json:"owner"`
		Name  string `json:"name"`
	} `json:"repo"`
	SHA        string  `json:"sha"`
	DeployedAt *string `json:"deployedAt"`
	URL        string  `json:"url"`
	Source     string  `json:"source"`
}

type deployProblem struct {
	status        int
	code, message string
}

func (s *Server) handleDeploy(w http.ResponseWriter, r *http.Request) {
	if s.Deploys == nil {
		deployError(w, http.StatusNotFound, "not_found", "This Ploeg does not accept deploys: PLOEG_DEPLOY_TOKEN is not set.")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		deployError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Report a deploy with POST.")
		return
	}
	if !s.Deploys.allows(r) {
		w.Header().Set("WWW-Authenticate", `Bearer realm="ploeg-deploys"`)
		deployError(w, http.StatusUnauthorized, "unauthorized", "The deploy bearer token is required.")
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, deployBodyLimit))
	if err != nil {
		deployError(w, http.StatusRequestEntityTooLarge, "invalid_request", "A deploy report is at most 16 KiB.")
		return
	}
	d, fp, problem := s.parseDeploy(body, time.Now().UTC())
	if problem != nil {
		deployError(w, problem.status, problem.code, problem.message)
		return
	}
	ctx := r.Context()
	recorded, err := s.Store.RecordDeployment(ctx, d)
	if err != nil {
		s.Log.Error("deploy not recorded", "forge", d.Forge, "repo", d.Owner+"/"+d.Name,
			"environment", d.Environment, "sha", d.SHA, "err", err)
		deployError(w, http.StatusServiceUnavailable, "unavailable", "Ploeg could not record the deploy.")
		return
	}
	s.Log.Info("deploy recorded", "deploy_id", recorded.ID, "new", recorded.Created, "forge", d.Forge,
		"repo", d.Owner+"/"+d.Name, "environment", d.Environment, "sha", d.SHA)
	marked := s.markDeployed(context.WithoutCancel(ctx), fp, d, recorded)
	writeJSON(w, http.StatusAccepted, map[string]any{"deployId": strconv.FormatInt(recorded.ID, 10), "pullRequests": marked})
}

func (s *Server) parseDeploy(body []byte, now time.Time) (store.Deployment, provider.ForgeProvider, *deployProblem) {
	invalid := func(message string) *deployProblem {
		return &deployProblem{status: http.StatusBadRequest, code: "invalid_request", message: message}
	}
	var req deployRequest
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		return store.Deployment{}, nil, invalid("The body must be one JSON object with environment, repo, sha and the optional deployedAt, url and source.")
	}
	if dec.More() {
		return store.Deployment{}, nil, invalid("The body must contain one JSON object.")
	}
	environment, ok := work.NormalizeEnvironment(req.Environment)
	if !ok {
		return store.Deployment{}, nil, invalid("environment must be 1 to 63 letters, digits, dots, underscores and dashes.")
	}
	if !deployForge.MatchString(req.Repo.Forge) || len(req.Repo.Owner) > 255 || !deployOwner.MatchString(req.Repo.Owner) ||
		!deployName.MatchString(req.Repo.Name) {
		return store.Deployment{}, nil, invalid("repo needs a forge, an owner and a name.")
	}
	sha := strings.ToLower(strings.TrimSpace(req.SHA))
	if !deploySHA.MatchString(sha) {
		return store.Deployment{}, nil, invalid("sha must be the full 40 or 64 character commit hash.")
	}
	deployedAt := now
	if req.DeployedAt != nil {
		at, err := time.Parse(time.RFC3339Nano, *req.DeployedAt)
		if err != nil {
			return store.Deployment{}, nil, invalid("deployedAt must be an RFC 3339 timestamp.")
		}
		if at.After(now.Add(deployFutureSkew)) {
			return store.Deployment{}, nil, invalid("deployedAt is in the future.")
		}
		deployedAt = at.UTC()
	}
	link, ok := deployLink(req.URL)
	if !ok {
		return store.Deployment{}, nil, invalid("url must be an absolute http or https URL of at most 2048 characters.")
	}
	switch req.Source {
	case "", "ci", "gitops", "manual":
	default:
		return store.Deployment{}, nil, invalid("source must be ci, gitops or manual.")
	}
	fp, ok := s.Forges[req.Repo.Forge]
	if !ok {
		return store.Deployment{}, nil, &deployProblem{status: http.StatusUnprocessableEntity, code: "unknown_forge",
			message: "repo.forge names no forge this Ploeg is configured for."}
	}
	return store.Deployment{Forge: fp.Name(), Owner: req.Repo.Owner, Name: req.Repo.Name, Environment: environment,
		SHA: sha, DeployedAt: deployedAt, URL: link, Source: req.Source}, fp, nil
}

func deployLink(raw string) (string, bool) {
	if raw == "" {
		return "", true
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
		return "", false
	}
	u.User, u.RawQuery, u.Fragment, u.RawFragment = nil, "", "", ""
	link := u.String()
	return link, len(link) <= 2048
}

func (s *Server) markDeployed(ctx context.Context, fp provider.ForgeProvider, d store.Deployment, recorded store.RecordedDeployment) int {
	ctx, cancel := context.WithTimeout(ctx, deployCheckTimeout)
	defer cancel()
	log := s.Log.With("deploy_id", recorded.ID, "forge", d.Forge, "repo", d.Owner+"/"+d.Name, "environment", d.Environment, "sha", d.SHA)
	candidates, err := s.Store.DeployCandidates(ctx, recorded.ID, deployMergeSkew, deployCandidateLimit)
	if err != nil {
		log.Error("deploy recorded but its pull requests were not checked", "err", err)
		return 0
	}
	if len(candidates) == deployCandidateLimit {
		log.Info("more merged pull requests await a deploy check than one deploy checks; the next deploy continues",
			"checked", deployCandidateLimit)
	}
	marked := 0
	for i, c := range candidates {
		if ctx.Err() != nil {
			log.Warn("deploy check stopped at its deadline; the next deploy continues", "unchecked", len(candidates)-i)
			break
		}
		ancestor, err := provider.IsAncestor(ctx, fp, c.Repo, c.MergeCommitSHA, d.SHA)
		if errors.Is(err, provider.ErrNoAncestry) {
			log.Warn("the forge cannot compare commits; no pull request is marked as deployed")
			return marked
		}
		if err != nil {
			log.Warn("deploy check failed for a pull request", "pr", c.Number, "merge_commit", c.MergeCommitSHA, "err", err)
			continue
		}
		if !ancestor {
			continue
		}
		newly, err := s.Store.MarkDeployed(ctx, c.PullRequestID, recorded.ID)
		if err != nil {
			log.Error("pull request deploy not recorded", "pr", c.Number, "err", err)
			continue
		}
		if newly {
			marked++
			log.Info("pull request deployed", "pr", c.Number, "merge_commit", c.MergeCommitSHA)
		}
	}
	return marked
}

func deployError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}
