#!/usr/bin/env node
// Quick browser test - captures console output
import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

console.log('Opening BoxSmith in browser and capturing console...\n');

const script = `
tell application "Safari"
    activate
    make new document
    set URL of front document to "http://localhost:3000/ui/index.html"
    delay 3
end tell
`;

const proc = spawn('osascript', ['-e', script]);

proc.on('close', (code) => {
    console.log('\n✅ Browser opened');
    console.log('\n📋 To debug:');
    console.log('1. Open Safari Developer Tools (Cmd+Option+I)');
    console.log('2. Go to Console tab');
    console.log('3. Look for errors (red text)');
    console.log('4. Check Network tab for failed requests');
    console.log('5. Enable "Debug" mode: localStorage.setItem("debug", "true")');
    console.log('\n💡 Key things to check:');
    console.log('- Any JavaScript errors?');
    console.log('- Do graphs render?');
    console.log('- Does Pin Current Design work?');
    console.log('- Are comparison table values populated?');
});
