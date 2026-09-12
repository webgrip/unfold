{{- define "vloer.name" -}}
{{- .Release.Name | trunc 40 | trimSuffix "-" -}}
{{- end -}}
{{- define "vloer.image" -}}
{{- if .Values.image.digest -}}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.repository (default .Chart.AppVersion .Values.image.tag) -}}
{{- end -}}
{{- end -}}
{{- define "vloer.labels" -}}
app.kubernetes.io/name: de-vloer
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
{{- define "vloer.workspaceImage" -}}
{{- default (printf "harbor.webgrip.dev/webgrip/de-vloer-agent:%s" .Chart.AppVersion) .Values.workspaceImage -}}
{{- end -}}
