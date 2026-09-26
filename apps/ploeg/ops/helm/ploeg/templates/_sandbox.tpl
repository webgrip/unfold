{{- define "ploeg.sandboxLauncherName" -}}
{{- printf "%s-sandbox-launcher" (include "ploeg.fullname" .) -}}
{{- end -}}

{{/*
ploeg.sandboxLauncherPodTemplate is the ScaledJob pod for executor.type
sandbox: it creates one SandboxClaim for its Job and waits for it. It holds the
only Kubernetes API token in the executor, scoped by its Role to sandboxclaims.
Context: (dict "root" $ "team" <team> "role" <role>).
*/}}
{{- define "ploeg.sandboxLauncherPodTemplate" -}}
{{- $root := .root }}
{{- $sb := $root.Values.executor.sandbox }}
metadata:
  labels:
    app.kubernetes.io/name: ploeg-sandbox-launcher
    ploeg.webgrip.dev/team: {{ .team.name }}
    {{- if .role.name }}
    ploeg.webgrip.dev/role: {{ .role.name }}
    {{- end }}
spec:
  restartPolicy: Never
  serviceAccountName: {{ include "ploeg.sandboxLauncherName" $root }}
  automountServiceAccountToken: true
  {{- with $root.Values.imagePullSecrets }}
  imagePullSecrets: {{- toYaml . | nindent 4 }}
  {{- end }}
  {{- with $root.Values.executor.nodeSelector }}
  nodeSelector: {{- toYaml . | nindent 4 }}
  {{- end }}
  containers:
    - name: launcher
      image: {{ $root.Values.executor.workerImage | default (include "ploeg.image" $root) }}
      command: ["/usr/local/bin/ploeg-worker", "sandbox-launch"]
      env:
        - name: POD_NAME
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: POD_NAMESPACE
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
        - name: PLOEG_SANDBOX_JOB_NAME
          valueFrom:
            fieldRef:
              fieldPath: metadata.labels['batch.kubernetes.io/job-name']
        - name: PLOEG_SANDBOX_JOB_UID
          valueFrom:
            fieldRef:
              fieldPath: metadata.labels['batch.kubernetes.io/controller-uid']
        - name: PLOEG_SANDBOX_WARM_POOL
          value: {{ include "ploeg.workloadName" . | quote }}
        - name: PLOEG_SANDBOX_RUN_DEADLINE
          value: {{ printf "%vs" $root.Values.executor.activeDeadlineSeconds | quote }}
        - name: PLOEG_SANDBOX_SHUTDOWN_MARGIN
          value: {{ printf "%vs" $sb.shutdownMarginSeconds | quote }}
        - name: PLOEG_SANDBOX_TTL_SECONDS_AFTER_FINISHED
          value: {{ $sb.ttlSecondsAfterFinished | quote }}
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: [ALL]
        seccompProfile:
          type: RuntimeDefault
      resources: {{- toYaml $sb.launcherResources | nindent 8 }}
{{- end -}}
