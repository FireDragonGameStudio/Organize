const path = require('path');
const fs = require('fs');

const ENGINE = 'C:/Users/marku/.claude/plugins/cache/ls-extensions/ls-clad/1.0.0/skills/build-sfx/tools';
const audio = require(ENGINE);

const PROJECT_ASSETS_SFX = 'C:/Users/marku/Snap/Organize/maXR-Organize/Assets/GeneratedSFX';
fs.mkdirSync(PROJECT_ASSETS_SFX, { recursive: true });

// NodeSelect — soft, precise UI blip when a graph node is tapped
function nodeSelect() {
    const p = audio.sfx_presets;
    const buf = p.uiBlip({ pitch: 2 });
    return audio.mix_bus.applyFx(buf, { gain: 0.8 });
}

// TypeChange — confirmation chime when a requirement's type is reassigned
function typeChange() {
    const p = audio.sfx_presets;
    const buf = p.uiSuccess();
    return audio.mix_bus.applyFx(buf, { gain: 0.75 });
}

const select = nodeSelect();
audio.mix_bus.masterChain(select, { normalize: 'peak' });
audio.WavBuilder.write(select, path.join(PROJECT_ASSETS_SFX, 'NodeSelect.wav'));

const change = typeChange();
audio.mix_bus.masterChain(change, { normalize: 'peak' });
audio.WavBuilder.write(change, path.join(PROJECT_ASSETS_SFX, 'TypeChange.wav'));

console.log('SFX generation complete: NodeSelect.wav, TypeChange.wav');
