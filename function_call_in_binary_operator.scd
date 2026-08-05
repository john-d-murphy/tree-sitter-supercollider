(
var sig = sig * EnvGen.kr(
	Env([0.0,1.0,1.0,0], [fadeIn, fadeOut], releaseNode: 2),
	gate: killgate,
	doneAction: 2
);
)
