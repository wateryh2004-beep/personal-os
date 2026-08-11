# Agent capability contract

`assistantToolRegistry` is the only source of executable, model-visible capabilities. The OS manifest is derived from it; it contains no hand-maintained operations list.

Every tool has a module, read/proposal risk, description and input schema. The AI SDK only receives tools selected from this registry. Unregistered names have no definition and are never mapped to a similar tool or executed.
