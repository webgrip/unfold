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
