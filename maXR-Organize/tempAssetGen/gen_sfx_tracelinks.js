// One-shot generator for the trace-link edit feature's two SFX cues.
// LinkAdded.wav / LinkRemoved.wav — see AGENTS.md skill build-sfx.
const path = require('path');
const fs = require('fs');

const ENGINE = 'C:/Users/marku/.claude/plugins/cache/ls-extensions/ls-clad/1.0.0/skills/build-sfx/tools';
const audio = require(ENGINE);

const PROJECT_ASSETS_SFX = 'C:/Users/marku/Snap/Organize/maXR-Organize/Assets/GeneratedSFX';
fs.mkdirSync(PROJECT_ASSETS_SFX, { recursive: true });

const p = audio.sfx_presets;

// LinkAdded — rising two-blip toggle ("on"), a bit brighter than the generic
// NodeSelect/TypeChange cues so a new trace connection reads as affirmative.
const added = p.uiToggle({ on: true, pitch: 2 });
audio.mix_bus.masterChain(added, { normalize: 'peak' });
audio.WavBuilder.write(added, path.join(PROJECT_ASSETS_SFX, 'LinkAdded.wav'));

// LinkRemoved — falling two-blip toggle ("off"), mirrors LinkAdded so the
// add/remove pair reads as a clear up/down semantic opposite.
const removed = p.uiToggle({ on: false, pitch: -2 });
audio.mix_bus.masterChain(removed, { normalize: 'peak' });
audio.WavBuilder.write(removed, path.join(PROJECT_ASSETS_SFX, 'LinkRemoved.wav'));

console.log('wrote LinkAdded.wav and LinkRemoved.wav');
