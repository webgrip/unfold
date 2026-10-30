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

{{- define "unfold.ploegFullname" -}}
{{- $ploeg := default (dict) .Values.ploeg -}}
{{- get $ploeg "fullnameOverride" | default .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "unfold.ploegInstance" -}}
{{- $ploeg := default (dict) .Values.ploeg -}}
{{- get $ploeg "instanceOverride" | default .Release.Name -}}
{{- end -}}

{{- define "unfold.workspaceRuntimeClassValue" -}}
{{- ternary "workspaceRuntimeClassName" "workspacePodRuntimeClassName" (eq .Values.workspaceProvisioner "sandbox") -}}
{{- end -}}

{{- define "unfold.workspaceUnsandboxed" -}}
{{- if and (eq .Values.mode "live") (not (get .Values (include "unfold.workspaceRuntimeClassValue" .))) -}}true{{- end -}}
{{- end -}}

{{- define "unfold.externalSecretName" -}}
{{- $ctx := index . 0 -}}
{{- printf "%s-%s" (include "unfold.name" $ctx) (index . 1 | trimPrefix "UNFOLD_" | lower | replace "_" "-") | trunc 253 | trimSuffix "-" -}}
{{- end -}}

{{- define "unfold.externalStoreKey" -}}
{{- $es := default (dict) .Values.externalSecrets -}}
{{- if and (get $es "enabled") (get (default (dict) (get $es "storeKey")) "key") -}}true{{- end -}}
{{- end -}}

{{- define "unfold.externalCredentials" -}}
{{- $es := default (dict) .Values.externalSecrets -}}
{{- if get $es "enabled" -}}{{- toJson (default (dict) (get $es "credentials")) -}}{{- else -}}{}{{- end -}}
{{- end -}}

{{- define "unfold.storeKeyRef" -}}
{{- $sk := default (dict) .Values.storeKey -}}
{{- if get $sk "existingSecret" -}}
{{- toJson (dict "name" (get $sk "existingSecret") "key" (default "key" (get $sk "secretKey"))) -}}
{{- else if include "unfold.externalStoreKey" . -}}
{{- toJson (dict "name" (include "unfold.externalSecretName" (list . "store-key")) "key" "key") -}}
{{- else -}}
{}
{{- end -}}
{{- end -}}

{{- define "unfold.storeKeyOnDataVolume" -}}
{{- if and (eq .Values.mode "live") (not (fromJson (include "unfold.storeKeyRef" .))) -}}true{{- end -}}
{{- end -}}

{{- define "unfold.credentialRefs" -}}
{{- $refs := dict -}}
{{- range $env, $ref := (default (dict) .Values.credentialRefs) -}}
{{- $_ := set $refs $env (dict "name" $ref.name "key" $ref.key) -}}
{{- end -}}
{{- range $env, $_ := (fromJson (include "unfold.externalCredentials" .)) -}}
{{- $_ := set $refs $env (dict "name" (include "unfold.externalSecretName" (list $ $env)) "key" $env) -}}
{{- end -}}
{{- toJson $refs -}}
{{- end -}}

{{- define "unfold.validateSecrets" -}}
{{- $refs := default (dict) .Values.credentialRefs -}}
{{- $external := fromJson (include "unfold.externalCredentials" .) -}}
{{- $es := default (dict) .Values.externalSecrets -}}
{{- $sk := default (dict) .Values.storeKey -}}
{{- if and (get $es "enabled") (not (get (default (dict) (get $es "secretStoreRef")) "name")) -}}{{- fail "externalSecrets.enabled needs externalSecrets.secretStoreRef.name: the SecretStore or ClusterSecretStore the ExternalSecrets read from" -}}{{- end -}}
{{- if and (get $sk "existingSecret") (include "unfold.externalStoreKey" .) -}}{{- fail "Set the store key once: storeKey.existingSecret or externalSecrets.storeKey, not both" -}}{{- end -}}
{{- if and (include "unfold.storeKeyOnDataVolume" .) (ne (toString (get $sk "allowFileOnDataVolume")) "true") -}}{{- fail "In live mode the store key must not sit on the data volume beside the database it opens: set storeKey.existingSecret to a Secret holding 32 random bytes as base64 or hex, or externalSecrets.storeKey, or set storeKey.allowFileOnDataVolume: true to keep the key file on the volume (apps/unfold/docs/operations/storage.md#the-store-key)" -}}{{- end -}}
{{- if and (ne .Values.mode "live") (or $refs $external) -}}{{- fail "mode demo gives every visitor admin; it cannot hold credentialRefs or externalSecrets.credentials. Remove them, or set mode: live" -}}{{- end -}}
{{- $chartSet := dict "UNFOLD_STORE_KEY" "storeKey" -}}
{{- if .Values.errorReports.sentry.existingSecret -}}{{- $_ := set $chartSet "UNFOLD_SENTRY_DSN" "errorReports.sentry.existingSecret" -}}{{- end -}}
{{- if and .Values.delivery.publisher.enabled .Values.delivery.publisher.existingSecret -}}{{- $_ := set $chartSet .Values.delivery.publisher.tokenEnv "delivery.publisher.existingSecret" -}}{{- end -}}
{{- if and .Values.decider.enabled .Values.decider.existingSecret -}}{{- $_ := set $chartSet .Values.decider.keyEnv "decider.existingSecret" -}}{{- end -}}
{{- range (default (list) .Values.extraEnv) -}}{{- $_ := set $chartSet .name "extraEnv" -}}{{- end -}}
{{- range $env, $ref := $refs -}}
{{- if hasKey $external $env -}}{{- fail (printf "%s is in both credentialRefs and externalSecrets.credentials: give it one source" $env) -}}{{- end -}}
{{- if has $ref.name (default (list) $.Values.workspaceAgentSecrets) -}}{{- fail (printf "workspaceAgentSecrets must not list %s: credentialRefs.%s reads a workbench credential from it" $ref.name $env) -}}{{- end -}}
{{- end -}}
{{- range $env, $_ := (fromJson (include "unfold.credentialRefs" .)) -}}
{{- if hasKey $chartSet $env -}}{{- fail (printf "%s already comes from %s: remove it from credentialRefs and externalSecrets.credentials" $env (get $chartSet $env)) -}}{{- end -}}
{{- end -}}
{{- range $env, $remote := $external -}}
{{- if not (get (default (dict) $remote) "key") -}}{{- fail (printf "externalSecrets.credentials.%s needs key: where the secret lives in the store" $env) -}}{{- end -}}
{{- $name := include "unfold.externalSecretName" (list $ $env) -}}
{{- if eq $name (include "unfold.externalSecretName" (list $ "store-key")) -}}{{- fail (printf "externalSecrets.credentials.%s would share the store key's Secret %s: rename the variable" $env $name) -}}{{- end -}}
{{- if has $name (default (list) $.Values.workspaceAgentSecrets) -}}{{- fail (printf "workspaceAgentSecrets must not list %s: it holds the workbench credential %s" $name $env) -}}{{- end -}}
{{- end -}}
{{- end -}}
