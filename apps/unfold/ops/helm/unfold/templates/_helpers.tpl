{{- define "unfold.name" -}}
{{- .Release.Name | trunc 40 | trimSuffix "-" -}}
{{- end -}}
{{- define "unfold.image" -}}
{{- if .Values.image.digest -}}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.repository (default .Chart.AppVersion .Values.image.tag) -}}
{{- end -}}
{{- end -}}
{{- define "unfold.labels" -}}
app.kubernetes.io/name: unfold
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
{{- define "unfold.workspaceImage" -}}
{{- default (printf "ghcr.io/webgrip/unfold-agent:%s" .Chart.AppVersion) .Values.workspaceImage -}}
{{- end -}}
