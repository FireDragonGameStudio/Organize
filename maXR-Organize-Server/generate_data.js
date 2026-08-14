const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function uuid() {
    return crypto.randomUUID();
}

// Real-world topics for the Telesurgery Robot
const urData = [
  { t: "Stereoscopic 3D Vision", d: "The surgeon needs a high-definition 3D view of the surgical site to perceive depth accurately." },
  { t: "Haptic Tissue Feedback", d: "The surgeon must feel physical resistance matching the tissue density being manipulated." },
  { t: "Sub-20ms Latency", d: "The system must respond to surgeon inputs instantly to prevent over-correction during delicate cuts." },
  { t: "Ergonomic Console", d: "The console must support a seated posture for operations lasting up to 8 hours without fatigue." },
  { t: "Maintain Sterile Field", d: "All patient-side components must be sterilizable or compatible with sterile draping." },
  { t: "Hard Emergency Stop", d: "The surgeon needs a physical button to instantly freeze all robotic movement." },
  { t: "Two-Way Audio", d: "The surgeon must be able to communicate clearly with the patient-side OR staff." },
  { t: "Vital Signs Overlay", d: "Patient vitals (HR, BP, SpO2) must be visible within the surgeon's field of view." },
  { t: "Dual-Console Mentoring", d: "Two surgeons must be able to share control of the robot for training purposes." },
  { t: "Surgical Video Recording", d: "The system must record the entire procedure from the endoscope's perspective." },
  { t: "Intuitive Clutching", d: "The surgeon must be able to reposition their hands without moving the robotic instruments." },
  { t: "Uninterruptible Power", d: "The robot must continue operating safely if hospital grid power fails." },
  { t: "Rapid Instrument Swap", d: "OR staff must be able to detach and attach new surgical instruments in under 10 seconds." },
  { t: "Collision Avoidance", d: "The robotic arms must never collide with each other or the patient's exterior." },
  { t: "System Alarms", d: "The system must provide audible and visual alerts for any hardware or software faults." },
  { t: "Quick OR Setup", d: "The robot must be ready for surgery within 15 minutes of entering the OR." },
  { t: "Cart Portability", d: "The patient-side cart must be easily moved between operating rooms by a single person." },
  { t: "Pre-Op Diagnostics", d: "The system must automatically test all joints and sensors before allowing surgery to begin." },
  { t: "Simulation Training Mode", d: "The console must support virtual reality simulation software for surgeon practice." },
  { t: "HIPAA Data Privacy", d: "All recorded patient data and video must be encrypted at rest and in transit." },
  { t: "Foot Pedal Controls", d: "The surgeon must use foot pedals to control electrocautery and camera zoom." }
];

const srData = [
  { t: "Dual 4K Video Pipeline", d: "The system shall process two 4K video streams at 60fps." },
  { t: "Force-Torque Sensing", d: "The system shall measure forces at the instrument tip up to 10N with 0.1N resolution." },
  { t: "End-to-End Latency < 15ms", d: "The system shall achieve < 15ms latency from console input to manipulator movement." },
  { t: "Adjustable Optics Viewport", d: "The system shall provide motorized interpupillary distance and height adjustments." },
  { t: "Autoclave Compatibility", d: "The system shall ensure all reusable instruments survive 134°C steam sterilization." },
  { t: "Hardware Interrupt Circuit", d: "The system shall route the E-Stop directly to the motor driver hardware interrupts." },
  { t: "Full-Duplex Audio System", d: "The system shall provide echo-canceling, full-duplex VoIP communication." },
  { t: "HL7 Vitals Integration", d: "The system shall ingest HL7 data streams from the patient monitor." },
  { t: "Control Handover Protocol", d: "The system shall support seamless token-passing for instrument control between two consoles." },
  { t: "H.265 Video Encoding", d: "The system shall encode surgical video using H.265 at 50Mbps." },
  { t: "Clutch Disengage State", d: "The system shall ignore hand controller inputs while the clutch pedal is depressed." },
  { t: "Battery Backup Unit", d: "The system shall include an integrated UPS capable of 30 minutes of full operation." },
  { t: "Magnetic Instrument Coupling", d: "The system shall use magnetic-assist mechanical couplings for instrument attachment." },
  { t: "Kinematic Boundary Limits", d: "The system shall enforce mathematical boundaries to prevent manipulator collisions." },
  { t: "Multi-tier Alarm Logic", d: "The system shall categorize faults into informational, warning, and critical tiers." },
  { t: "Automated Homing Sequence", d: "The system shall self-calibrate all joints to absolute zero upon startup." },
  { t: "Motorized Casters", d: "The system shall feature motorized drive wheels for transport assist." },
  { t: "Power-On Self Test (POST)", d: "The system shall execute a 60-second POST checking all logic boards." },
  { t: "OpenXR API Support", d: "The system shall expose an OpenXR-compliant interface for VR simulation." },
  { t: "AES-256 Encryption", d: "The system shall encrypt all stored logs and video using AES-256." },
  { t: "Quad-Pedal Interface", d: "The system shall read inputs from a 4-switch foot pedal assembly." },
  { t: "Redundant Network Links", d: "The system shall maintain two parallel network connections between console and cart." },
  { t: "Kinematic Tremor Filter", d: "The system shall filter out human hand tremors above 6Hz." },
  { t: "Motion Scaling", d: "The system shall support 3:1, 2:1, and 1:1 motion scaling factors." },
  { t: "Endoscope Illumination", d: "The system shall provide adjustable cold-LED illumination via fiber optics." },
  { t: "Thermal Management", d: "The system shall maintain motor core temperatures below 85°C." },
  { t: "Instrument Lifespan Tracking", d: "The system shall track the number of uses per instrument and enforce a hard limit." },
  { t: "Telesurgery Latency Compensation", d: "The system shall predict and compensate for network jitter up to 50ms." },
  { t: "Surgeon Eye Tracking", d: "The system shall track surgeon gaze to control UI elements." },
  { t: "Automated Suture Cutting", d: "The system shall provide a macro for automated tension and cutting of sutures." }
];

const swrData = [
  "Implement WebRTC for video", "Develop PID motor controllers", "Write HL7 parser", "Develop UI overlay renderer",
  "Implement AES encryption module", "Write POST diagnostics script", "Develop OpenXR driver", "Implement kinematic solver",
  "Write tremor filter algorithm", "Develop alarm state machine", "Implement clutch logic", "Write battery monitoring daemon",
  "Develop transport assist controller", "Implement token handover logic", "Write collision detection tree",
  "Develop H.265 encoding pipeline", "Implement audio echo cancellation", "Write instrument lifespan tracker",
  "Develop eye-tracking calibration", "Implement automated homing sequence", "Write motion scaling matrix math",
  "Develop thermal throttling logic", "Implement network failover protocol", "Write UI gaze-selection logic",
  "Develop suture macro script", "Implement logging database", "Write firmware update manager", "Develop surgeon profile system",
  "Implement 3D stereoscopic rendering", "Write robotic arm simulator", "Develop calibration wizard", "Implement haptic feedback loop",
  "Write motor driver interface", "Develop emergency stop handler", "Implement network jitter buffer", "Write video streaming client",
  "Develop multi-tenant cloud sync", "Implement authentication protocol", "Write error reporting service", "Develop VR training environment",
  "Implement voice command parser", "Write touch-screen driver", "Develop instrument RFID reader", "Implement system heartbeat monitor",
  "Write hardware interrupt listener", "Develop telemetry dashboard", "Implement robotic path planner", "Write inverse kinematics library"
];

const dirData = [
  "Select 4K CMOS sensors", "Specify 10N torque motors", "Design ergonomic hand controllers", "Select AES encryption coprocessor",
  "Specify 134°C autoclavable plastics", "Design physical E-Stop button", "Select VoIP microphones", "Specify HL7 network port",
  "Design dual-console link cable", "Select H.265 hardware encoder", "Specify clutch foot pedal", "Design 30-min Li-Ion UPS",
  "Select magnetic couplings", "Specify robotic arm carbon fiber", "Design alarm speaker system", "Select absolute rotary encoders",
  "Specify motorized casters", "Design POST logic board", "Select VR headset displays", "Specify encrypted SSDs",
  "Design quad-pedal assembly", "Select redundant gigabit switches", "Specify 1000Hz sampling ADCs", "Design motion scaling toggle",
  "Select fiber optic illuminator", "Specify active cooling fans", "Design instrument EEPROMs", "Select low-latency network cards",
  "Specify eye-tracking IR cameras", "Design suture cutting shears", "Select FPGA for kinematics", "Specify sterile draping clips",
  "Design surgeon chair padding", "Select high-brightness LEDs", "Specify titanium surgical tips", "Design transport handle grips",
  "Select backup power relays", "Specify medical grade power supply", "Design articulating wrist joint", "Select low-friction bearings",
  "Specify EMI shielding", "Design touchscreen display panel", "Select RFID antenna", "Specify heartbeat watchdog timer",
  "Design hardware interrupt routing", "Select telemetry WiFi module", "Specify path planning CPU", "Design inverse kinematics DSP"
];

const URs = [];
const SRs = [];
const SWRs = [];
const DIRs = [];

// 1. URs (21)
urData.forEach((data, i) => {
  URs.push({
    id: uuid(),
    name: `UR-${(i+1).toString().padStart(2, '0')}`,
    title: data.t,
    description: data.d,
    type: 'UR',
    traceLinks: []
  });
});

// 2. SRs (30)
srData.forEach((data, i) => {
  SRs.push({
    id: uuid(),
    name: `SR-${(i+1).toString().padStart(2, '0')}`,
    title: data.t,
    description: data.d,
    type: 'SR',
    traceLinks: []
  });
});

// Trace SRs up to URs
SRs.forEach((sr, i) => {
  // Each SR traces to 1-2 URs randomly or semi-randomly
  const urIndex = i % URs.length;
  URs[urIndex].traceLinks.push(sr.id);
  
  if (i % 3 === 0) { // Some trace to a second UR
    const secondUr = (i + 5) % URs.length;
    if (secondUr !== urIndex) {
      URs[secondUr].traceLinks.push(sr.id);
    }
  }
});

// 3. SWRs (48)
swrData.forEach((t, i) => {
  SWRs.push({
    id: uuid(),
    name: `SWR-${(i+1).toString().padStart(2, '0')}`,
    title: t,
    description: `The software subsystem shall ${t.toLowerCase()} in accordance with medical software safety standards.`,
    type: 'SWR',
    traceLinks: []
  });
});

// Trace SWRs up to SRs
SWRs.forEach((swr, i) => {
  const srIndex = i % SRs.length;
  SRs[srIndex].traceLinks.push(swr.id);
});

// 4. DIRs (48)
dirData.forEach((t, i) => {
  DIRs.push({
    id: uuid(),
    name: `DIR-${(i+1).toString().padStart(2, '0')}`,
    title: t,
    description: `The hardware engineering team shall ${t.toLowerCase()} to meet the physical system constraints.`,
    type: 'DIR',
    traceLinks: []
  });
});

// Trace DIRs up to SRs
DIRs.forEach((dir, i) => {
  // Reverse map so different SRs get DIRs
  const srIndex = (SRs.length - 1) - (i % SRs.length);
  SRs[srIndex].traceLinks.push(dir.id);
});

// Add some random cross-tracing for realism
for (let i = 0; i < 15; i++) {
  const randomSR = SRs[Math.floor(Math.random() * SRs.length)];
  const randomSWR = SWRs[Math.floor(Math.random() * SWRs.length)];
  const randomDIR = DIRs[Math.floor(Math.random() * DIRs.length)];
  
  if (!randomSR.traceLinks.includes(randomSWR.id)) randomSR.traceLinks.push(randomSWR.id);
  if (!randomSR.traceLinks.includes(randomDIR.id)) randomSR.traceLinks.push(randomDIR.id);
}

// Write to files
const baseDir = path.join(__dirname, 'backend', 'data', 'projects', 'test-project');
fs.writeFileSync(path.join(baseDir, 'user.json'), JSON.stringify(URs, null, 2));
fs.writeFileSync(path.join(baseDir, 'system.json'), JSON.stringify(SRs, null, 2));
fs.writeFileSync(path.join(baseDir, 'software.json'), JSON.stringify(SWRs, null, 2));
fs.writeFileSync(path.join(baseDir, 'design_input.json'), JSON.stringify(DIRs, null, 2));

console.log('Successfully generated complex requirement dataset!');
console.log(`URs: ${URs.length}`);
console.log(`SRs: ${SRs.length}`);
console.log(`SWRs: ${SWRs.length}`);
console.log(`DIRs: ${DIRs.length}`);
