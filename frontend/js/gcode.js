// MandalaBurn - G-code Generator (GRBL dialect)
MB.GCode = {
    generate(commands, settings) {
        if (!commands || commands.length === 0) return '';
        const maxPower = settings.maxPower || 1000;
        const lines = [];

        // Header
        lines.push('; MandalaBurn G-code');
        lines.push('; Machine: ' + (settings.name || 'Laser'));
        lines.push('G90 G21'); // absolute positioning, mm units
        lines.push('M5 S0');   // laser off

        let lastSpeed = -1;
        let lastPower = -1;
        let lastAir = false;
        let laserMode = ''; // 'M3' (constant) or 'M4' (dynamic/raster)

        for (const cmd of commands) {
            if (cmd.type === 'rapid') {
                // Laser off for rapid moves
                if (lastPower !== 0) {
                    lines.push('M5 S0');
                    lastPower = 0;
                }
                const speedMM = Math.round(cmd.speed * 60); // mm/s → mm/min
                let line = 'G0 X' + cmd.to.x.toFixed(3) + ' Y' + cmd.to.y.toFixed(3);
                if (speedMM !== lastSpeed) {
                    line += ' F' + speedMM;
                    lastSpeed = speedMM;
                }
                lines.push(line);
            } else if (cmd.type === 'cut') {
                // Air assist
                if (cmd.airAssist && !lastAir) {
                    lines.push('M8'); // air on
                    lastAir = true;
                } else if (!cmd.airAssist && lastAir) {
                    lines.push('M9'); // air off
                    lastAir = false;
                }

                // Laser mode: M4 for raster (dynamic power), M3 for vector (constant)
                const needMode = cmd.mode === 'image' ? 'M4' : 'M3';
                if (needMode !== laserMode) {
                    laserMode = needMode;
                    // Force power re-emit after mode switch
                    lastPower = -1;
                }

                // Power
                const sVal = Math.round(cmd.power * maxPower / 100);
                if (sVal !== lastPower) {
                    lines.push(laserMode + ' S' + sVal);
                    lastPower = sVal;
                }

                // Cut move
                const speedMM = Math.round(cmd.speed * 60);
                let line = 'G1 X' + cmd.to.x.toFixed(3) + ' Y' + cmd.to.y.toFixed(3);
                if (speedMM !== lastSpeed) {
                    line += ' F' + speedMM;
                    lastSpeed = speedMM;
                }
                lines.push(line);
            }
        }

        // Footer
        lines.push('M5 S0');
        if (lastAir) lines.push('M9');
        lines.push('G0 X0 Y0');
        lines.push('; End of job');

        return lines.join('\n') + '\n';
    },

    exportFile() {
        // Compile simulator commands
        MB.Simulator.compile();
        const commands = MB.Simulator.commands;
        if (commands.length === 0) {
            document.getElementById('status-info').textContent =
                'Nothing to export (no paths on output layers)';
            return;
        }

        const gcode = this.generate(commands, MB.Machine.settings);

        // Download as .gcode file
        const blob = new Blob([gcode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (MB.Machine.settings.name || 'job').replace(/[^a-zA-Z0-9_-]/g, '_') + '.gcode';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        document.getElementById('status-info').textContent =
            'Exported ' + commands.length + ' commands to G-code';
    }
};
