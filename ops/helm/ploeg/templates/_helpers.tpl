{{- define "ploeg.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "ploeg.labels" -}}
app.kubernetes.io/name: ploeg
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "ploeg.selectorLabels" -}}
app.kubernetes.io/name: ploeg
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "ploeg.image" -}}
{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}
{{- end -}}

{{- define "ploeg.apiUrl" -}}
{{ .Values.executor.apiUrl | default (printf "http://%s:%v" (include "ploeg.fullname" .) .Values.service.port) }}
{{- end -}}

{{/*
ploeg.workerPodTemplate renders the worker pod template for one team —
shared by every executor (ScaledJob, CronJob). Context: (dict "root" $
"team" <team entry>). The team's optional `harness` block overrides the
global executor.harness defaults field-by-field (explicit hasKey checks, so
`dind: false` overrides correctly — sprig merge would drop it).
*/}}
{{- define "ploeg.workerPodTemplate" -}}
{{- $root := .root }}
{{- $team := .team }}
{{- $gh := $root.Values.executor.harness | default dict }}
{{- $th := $team.harness | default dict }}
{{- $hName := $th.name | default ($gh.name | default "openhands") }}
{{- $hImage := $th.image | default ($gh.image | default $root.Values.executor.runnerImage) }}
{{- $hEntrypoint := $th.entrypoint | default $gh.entrypoint }}
{{- $hArgs := $th.args | default $gh.args }}
{{- $hOutcomeFile := $th.outcomeFile | default $gh.outcomeFile }}
{{- $hDind := true }}
{{- if hasKey $th "dind" }}{{- $hDind = $th.dind }}{{- else if hasKey $gh "dind" }}{{- $hDind = $gh.dind }}{{- end }}
{{- $dt := $root.Values.executor.defaultTarget | default dict }}
{{/* acp harness: same field-by-field override, one level deeper. */}}
{{- $ga := $gh.acp | default dict }}
{{- $ta := $th.acp | default dict }}
{{- $acpProfile := $ta.profile | default $ga.profile }}
{{- $acpArgv := $ta.argv | default $ga.argv }}
{{- $acpPerm := $ta.permissionMode | default $ga.permissionMode }}
{{- $acpPrompt := $ta.promptTimeout | default $ga.promptTimeout }}
{{- $acpIdle := $ta.idleTimeout | default $ga.idleTimeout }}
{{- $acpConfig := $ta.configJson | default $ga.configJson }}
{{- if and (eq $hName "acp") (eq ($acpProfile | default "opencode") "custom") (not $acpArgv) }}
{{- fail (printf "team %s: harness.acp.profile=custom requires harness.acp.argv" $team.name) }}
{{- end -}}
metadata:
  labels:
    app.kubernetes.io/name: ploeg-worker
    ploeg.webgrip.dev/team: {{ $team.name }}
spec:
  restartPolicy: Never
  automountServiceAccountToken: false
  {{- with $root.Values.imagePullSecrets }}
  imagePullSecrets: {{- toYaml . | nindent 4 }}
  {{- end }}
  nodeSelector:
    node.webgrip.io/pool: worker # never control-plane (ADR-0002: DinD beside etcd)
  securityContext:
    fsGroup: 1000
  initContainers:
    # Extracts ploeg-worker from the distroless ploegd image via
    # self-copy (no shell in distroless).
    - name: worker-bin
      image: {{ $root.Values.executor.workerImage | default (include "ploeg.image" $root) }}
      command: ["/usr/local/bin/ploeg-worker", "install", "/mnt/bin/ploeg-worker"]
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        allowPrivilegeEscalation: false
        capabilities:
          drop: [ALL]
        seccompProfile:
          type: RuntimeDefault
      volumeMounts:
        - name: worker-bin
          mountPath: /mnt/bin
      resources: {{- toYaml $root.Values.executor.workerBinResources | nindent 8 }}
    {{- if $hDind }}
    # DinD sidecar: the harness sandbox and the repo quality gates need a
    # Docker daemon. Requires the ploeg-worker PolicyException. Teams whose
    # harness needs no Docker set harness.dind: false.
    - name: dind
      image: {{ $root.Values.executor.dindImage }}
      restartPolicy: Always
      securityContext:
        privileged: true
      env:
        - name: DOCKER_TLS_CERTDIR
          value: /certs
      startupProbe:
        tcpSocket:
          port: 2376
        periodSeconds: 2
        failureThreshold: 60
        timeoutSeconds: 5
      volumeMounts:
        - name: docker-certs
          mountPath: /certs
        - name: docker-storage
          mountPath: /var/lib/docker
        - name: ci-shared
          mountPath: /mnt/ci-shared
      resources: {{- toYaml $root.Values.executor.dindResources | nindent 8 }}
    {{- end }}
  containers:
    - name: worker
      image: {{ $hImage }}
      command: ["/mnt/bin/ploeg-worker"]
      env:
        - name: PLOEG_API_URL
          value: {{ include "ploeg.apiUrl" $root | quote }}
        - name: PLOEG_TEAM
          value: {{ $team.name | quote }}
        - name: PLOEG_HARNESS
          value: {{ $hName | quote }}
        {{- if $hEntrypoint }}
        - name: PLOEG_HARNESS_ENTRYPOINT
          value: {{ $hEntrypoint | quote }}
        {{- end }}
        {{- if $hArgs }}
        - name: PLOEG_HARNESS_ARGS
          value: {{ toJson $hArgs | quote }}
        {{- end }}
        {{- if $hOutcomeFile }}
        - name: PLOEG_OUTCOME_FILE
          value: {{ $hOutcomeFile | quote }}
        {{- end }}
        {{- if eq $hName "acp" }}
        {{- if $acpProfile }}
        - name: PLOEG_ACP_PROFILE
          value: {{ $acpProfile | quote }}
        {{- end }}
        {{- if $acpArgv }}
        - name: PLOEG_ACP_ARGV
          value: {{ toJson $acpArgv | quote }}
        {{- end }}
        {{- if $acpPerm }}
        - name: PLOEG_ACP_PERMISSION_MODE
          value: {{ $acpPerm | quote }}
        {{- end }}
        {{- if $acpPrompt }}
        - name: PLOEG_ACP_PROMPT_TIMEOUT
          value: {{ $acpPrompt | quote }}
        {{- end }}
        {{- if $acpIdle }}
        - name: PLOEG_ACP_IDLE_TIMEOUT
          value: {{ $acpIdle | quote }}
        {{- end }}
        {{- if $acpConfig }}
        - name: PLOEG_ACP_CONFIG_JSON
          value: {{ $acpConfig | quote }}
        {{- end }}
        {{- end }}
        - name: LLM_MODEL
          value: {{ $team.model | quote }}
        - name: LITELLM_KEY_BUDGET
          value: {{ $team.budget | quote }}
        - name: LITELLM_KEY_DURATION
          value: {{ $root.Values.executor.litellm.keyDuration | quote }}
        - name: LLM_BASE_URL
          value: {{ $root.Values.executor.litellm.baseUrl | quote }}
        - name: LITELLM_ADMIN_URL
          value: {{ $root.Values.executor.litellm.adminUrl | quote }}
        - name: LITELLM_MASTER_KEY
          valueFrom:
            secretKeyRef:
              name: {{ $root.Values.executor.litellm.masterKeySecret.name }}
              key: {{ $root.Values.executor.litellm.masterKeySecret.key }}
        - name: FORGEJO_URL
          value: {{ $root.Values.executor.forgejo.url | quote }}
        - name: AGENT_BUILDER_TOKEN
          valueFrom:
            secretKeyRef:
              name: {{ $root.Values.executor.forgejo.tokenSecret.name }}
              key: {{ $root.Values.executor.forgejo.tokenSecret.key }}
        # FALLBACK target only. The repository belongs to the work item,
        # resolved at ingest from its tracker scope and delivered on the claim
        # (R11, ADR-0001); these render only while a team still pins a repo,
        # and a team that declares none renders no repo env at all.
        {{- $repoOwner := $team.repoOwner | default $dt.owner }}
        {{- $repoName := $team.repoName | default $dt.name }}
        {{- $baseBranch := $team.baseBranch | default $dt.baseBranch }}
        {{- if $repoOwner }}
        - name: REPO_OWNER
          value: {{ $repoOwner | quote }}
        {{- end }}
        {{- if $repoName }}
        - name: REPO_NAME
          value: {{ $repoName | quote }}
        {{- end }}
        {{- if $baseBranch }}
        # Base branch for clone/branch/PR (VIK-589). Unset = the repo's
        # default branch on clone and the worker's historical "main".
        - name: PLOEG_BASE_BRANCH
          value: {{ $baseBranch | quote }}
        {{- end }}
        {{- if $team.targetSource }}
        # env = ignore the claim's target and use this team's pinned repo.
        # The per-team lever for rolling the decoupling forward or back.
        - name: PLOEG_TARGET_SOURCE
          value: {{ $team.targetSource | quote }}
        {{- end }}
        # Downward API: node+pod identity survives pod/job cleanup for
        # run forensics (VIK-597). Logged at worker start and embedded in
        # every checkpoint.
        - name: NODE_NAME
          valueFrom:
            fieldRef:
              fieldPath: spec.nodeName
        - name: POD_UID
          valueFrom:
            fieldRef:
              fieldPath: metadata.uid
        - name: WORK_DIR
          value: /mnt/ci-shared
        {{- if $hDind }}
        - name: DOCKER_HOST
          value: tcp://localhost:2376
        - name: DOCKER_CERT_PATH
          value: /certs/client
        - name: DOCKER_TLS_VERIFY
          value: "1"
        {{- end }}
      volumeMounts:
        - name: worker-bin
          mountPath: /mnt/bin
          readOnly: true
        {{- if $hDind }}
        - name: docker-certs
          mountPath: /certs
          readOnly: true
        {{- end }}
        - name: ci-shared
          mountPath: /mnt/ci-shared
      resources: {{- toYaml $root.Values.executor.workerResources | nindent 8 }}
  volumes:
    - name: worker-bin
      emptyDir: {}
    {{- if $hDind }}
    - name: docker-certs
      emptyDir: {}
    - name: docker-storage
      emptyDir: {}
    {{- end }}
    # Disk-backed (not tmpfs): repo checkout + gate builds are large.
    # Same absolute path in worker AND dind so `docker run -v`
    # bind-mounts resolve on the daemon's filesystem.
    - name: ci-shared
      emptyDir:
        sizeLimit: 8Gi
{{- end -}}
