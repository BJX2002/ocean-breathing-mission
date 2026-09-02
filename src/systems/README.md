# Gameplay systems

Reserved for the initial milestone. Gameplay systems (oxygen consumption,
photography scoring, deployment/replay, evidence matching, ...) will live here.

Systems communicate with the UI through the `EventBus` (see `src/events/`) and
never import UI code directly. Scenes orchestrate systems; they do not contain
the full gameplay logic themselves.
