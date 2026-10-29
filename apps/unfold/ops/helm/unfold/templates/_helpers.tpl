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
{{- if .Values.workspaceImage -}}
{{- .Values.workspaceImage -}}
{{- else -}}
{{- $image := .Values.workspaceAgentImage -}}
{{- printf "%s:%s" $image.repository (default .Chart.AppVersion $image.tag) -}}
{{- with $image.digest -}}@{{ . }}{{- end -}}
{{- end -}}
{{- end -}}

{{- define "unfold.ploegAttribution" -}}
{{- $ploeg := default (dict) .Values.ploeg -}}
{{- $env := default (dict) (get $ploeg "env") -}}
{{- $operator := default (dict) (get $ploeg "operator") -}}
{{- if hasKey $env "PLOEG_OPERATOR_ATTRIBUTION" -}}
{{- get $env "PLOEG_OPERATOR_ATTRIBUTION" -}}
{{- else if get $operator "attribution" -}}
{{- get $operator "attribution" -}}
{{- else -}}
{{- $version := "0.0.0" -}}
{{- range .Chart.Dependencies -}}{{- if eq .Name "ploeg" -}}{{- $version = .Version -}}{{- end -}}{{- end -}}
{{- ternary "proven" "asserted" (semverCompare ">=0.3.0-0" $version) -}}
{{- end -}}
{{- end -}}
