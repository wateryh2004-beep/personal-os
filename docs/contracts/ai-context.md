# AI context contract

`currentSurface` is direct command input, not retrieval context. A Notes transform sets `requiresCurrentSurface`; runtime rejects the request before model invocation if it is unavailable.

Personal Context is additive. Enabling it can add retrieval/tools but cannot remove or truncate the current Note body. Development traces report only inclusion flags and character counts, never body contents.
