export function renderBullets(ctx, state, cell) {
    (state.bullets ?? []).forEach(b => {
        const x = b.col * cell;
        const y = b.row * cell;

        if (b.is_missile) {
            // Sun missile — glowing orange fireball with trailing glow
            ctx.save();
            const sz = Math.max(6, cell * 0.5);
            const grad = ctx.createRadialGradient(x, y, 0, x, y, sz);
            grad.addColorStop(0, "rgba(255,255,200,1)");
            grad.addColorStop(0.3, "rgba(255,180,0,0.9)");
            grad.addColorStop(0.7, "rgba(255,80,0,0.5)");
            grad.addColorStop(1, "rgba(255,40,0,0)");
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, sz, 0, Math.PI * 2);
            ctx.fill();

            // Pulsing core
            const pulse = 0.8 + 0.2 * Math.sin(Date.now() / 80);
            ctx.fillStyle = `rgba(255,255,220,${pulse})`;
            ctx.beginPath();
            ctx.arc(x, y, sz * 0.25, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
        }

        if (b.is_grenade) {
            // Grenade — bomb emoji with glow
            ctx.save();
            const sz = Math.max(8, cell * 0.5);
            const glowPulse = 0.5 + 0.3 * Math.sin(Date.now() / 100);
            ctx.shadowColor = `rgba(255,80,0,${glowPulse})`;
            ctx.shadowBlur = sz * 0.6;
            ctx.font = `${sz * 1.6}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("💣", x, y);
            ctx.restore();
            return;
        }

        ctx.fillStyle = b.is_player ? "#ffffff" : "#ff4444";
        const sz = b.crush_bricks ? Math.max(4, cell * 0.4) : Math.max(2, cell * 0.18);
        ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    });
}

export function renderExplosions(renderer, ctx, state, cell) {
    (state.explosions ?? []).forEach(exp => renderer._drawExplosion(ctx, exp, cell));
}

// Letter Powerup Effects Rendering

export function renderLetterEffects(ctx, state, cell) {
    // B — Banana bouncing vertically
    (state.bananas ?? []).forEach(banana => {
        const x = banana.col * cell;
        const y = banana.row * cell;
        const size = cell * 4; // Banana emoji size

        ctx.save();
        ctx.translate(x, y);

        // Banana always points downward (falling)
        const rotation = Math.PI / 2; // 90 degrees = pointing down
        ctx.rotate(rotation);

        // Color changes with bounce count
        const phaseColors = ["#FFE135", "#FFA500", "#FF4500"];
        const glowColor = phaseColors[banana.bounce_count] || "#FFE135";
        const isFinalBounce = banana.bounce_count >= 2;

        // Speed-based motion blur/stretch
        const velocity = banana.velocity || 0;
        const stretchY = 1 + Math.abs(velocity) * 0.5;
        const stretchX = 1 - Math.abs(velocity) * 0.2;

        // Vertical motion trail (above banana when falling, below when rising)
        const trailCount = 6;
        for (let i = trailCount; i > 0; i--) {
            const trailDist = i * (cell * 0.3);
            // Trail appears above banana (showing where it came from)
            const trailY = -trailDist * Math.sign(velocity || 1);
            const trailAlpha = 0.35 - (i / trailCount) * 0.3;
            const trailScale = 1 - (i / trailCount) * 0.5;

            ctx.save();
            ctx.translate(0, trailY);
            ctx.scale(stretchX * trailScale, stretchY * trailScale);
            ctx.globalAlpha = Math.max(0.05, trailAlpha);
            ctx.rotate(-rotation); // Counter-rotate for trail
            ctx.font = `${size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🍌", 0, 0);
            ctx.restore();
        }

        // Main banana emoji with glow and stretch
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = isFinalBounce ? size * 0.8 : size * 0.5;
        ctx.scale(stretchX, stretchY);
        ctx.font = `${size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🍌", 0, 0);

        // Draw target indicator on ground (where banana will land)
        if (banana.state === "falling" && banana.target_row !== undefined) {
            const tx = (banana.target_col ?? banana.col) * cell;
            const ty = (banana.target_row ?? banana.row) * cell;
            const targetSize = cell * 3;

            ctx.save();
            ctx.translate(tx, ty);

            // Pulsing target circle
            const pulse = Math.sin(Date.now() / 150) * 0.3 + 0.5;
            ctx.strokeStyle = `rgba(255, 100, 0, ${pulse})`;
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.6;

            // Dashed circle at target
            ctx.setLineDash([8, 4]);
            ctx.beginPath();
            ctx.arc(0, 0, targetSize, 0, Math.PI * 2);
            ctx.stroke();

            // X mark at center
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            ctx.moveTo(-targetSize * 0.4, -targetSize * 0.4);
            ctx.lineTo(targetSize * 0.4, targetSize * 0.4);
            ctx.moveTo(targetSize * 0.4, -targetSize * 0.4);
            ctx.lineTo(-targetSize * 0.4, targetSize * 0.4);
            ctx.stroke();

            ctx.restore();
        }

        // Impact rings on landing (final bounce gets super TNT rings)
        if (isFinalBounce && banana.state === "falling") {
            const ringBaseSize = cell * 4;
            const ringExpand = Math.sin(Date.now() / 100) * 8;
            const intenseGlow = "#FF4500";

            // Outer ring
            ctx.save();
            ctx.rotate(-rotation); // Counter-rotate for rings
            ctx.strokeStyle = intenseGlow;
            ctx.lineWidth = 6;
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            ctx.arc(0, 0, ringBaseSize + ringExpand, 0, Math.PI * 2);
            ctx.stroke();

            // Middle ring
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(0, 0, ringBaseSize + ringExpand * 1.5, 0, Math.PI * 2);
            ctx.stroke();

            // Inner ring
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(0, 0, ringBaseSize + ringExpand * 2, 0, Math.PI * 2);
            ctx.stroke();

            // Pulsing fill glow
            const fillAlpha = 0.15 + Math.sin(Date.now() / 150) * 0.05;
            const gradient = ctx.createRadialGradient(0, 0, ringBaseSize * 0.3, 0, 0, ringBaseSize * 1.8);
            gradient.addColorStop(0, `rgba(255, 100, 0, ${fillAlpha})`);
            gradient.addColorStop(0.5, `rgba(255, 50, 0, ${fillAlpha * 0.5})`);
            gradient.addColorStop(1, "rgba(255, 0, 0, 0)");
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, ringBaseSize * 1.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();
    });

    // F — Fireworks rays
    (state.fireworks ?? []).forEach(fw => {
        const [originRow, originCol] = fw.origin;
        const ox = originCol * cell;
        const oy = originRow * cell;

        ctx.save();
        ctx.globalAlpha = fw.ttl / 30;

        // Draw 8-directional rays
        const directions = [
            [-1, 0], [-1, 1], [0, 1], [1, 1],
            [1, 0], [1, -1], [0, -1], [-1, -1]
        ];

        directions.forEach(([dr, dc]) => {
            for (let i = 0; i < 20; i++) {
                const x = ox + dc * cell * i;
                const y = oy + dr * cell * i;
                const sparkle = Math.random() > 0.5 ? "#FFD700" : "#FF69B4";
                ctx.fillStyle = sparkle;
                ctx.fillRect(x - 2, y - 2, 4, 4);
            }
        });

        ctx.restore();
    });

    // A — Airplane (5x bigger) + bombs
    (state.airplanes ?? []).forEach(plane => {
        const x = plane.col * cell;
        const y = plane.row * cell;

        ctx.save();
        ctx.translate(x, y);
        
        // Rotate airplane to match flight direction
        const rotation = plane.rotation || 0;
        ctx.rotate((rotation * Math.PI) / 180);
        
        // 5x bigger airplane (was cell * 1.5, now cell * 7.5)
        ctx.font = `${cell * 7.5}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("✈️", 0, 0);
        ctx.restore();
    });

    // A — Bombs falling from airplane
    (state.bombs ?? []).forEach(bomb => {
        const x = bomb.col * cell;
        const y = bomb.row * cell;

        ctx.save();
        // Bomb emoji with glow
        const size = cell * 2;
        const glowPulse = 0.5 + 0.3 * Math.sin(Date.now() / 100);
        ctx.shadowColor = `rgba(255,80,0,${glowPulse})`;
        ctx.shadowBlur = size * 0.6;
        ctx.font = `${size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("💣", x, y);
        ctx.restore();
    });

    // M — Magnet
    (state.magnets ?? []).forEach(magnet => {
        const x = magnet.col * cell;
        const y = magnet.row * cell;
        const radius = magnet.radius * cell;

        ctx.save();
        ctx.translate(x, y);

        // Magnet emoji
        ctx.font = `${cell * 1.5}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🧲", 0, 0);

        // Pull radius indicator
        ctx.strokeStyle = "rgba(220, 20, 60, 0.3)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
        ctx.stroke();

        // Pull lines
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 100);
        ctx.strokeStyle = "#DC143C";
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const innerR = cell * 1.5;
            const outerR = radius * 0.6;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * innerR, Math.sin(angle) * innerR);
            ctx.lineTo(Math.cos(angle) * outerR, Math.sin(angle) * outerR);
            ctx.stroke();
        }

        ctx.restore();
    });

    // S — Sahur runner
    (state.sahur_runners ?? []).forEach(runner => {
        const x = runner.col * cell;
        const y = runner.row * cell;

        ctx.save();
        ctx.font = `${cell}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // Running person emoji with motion blur effect
        const blur = (runner.ttl % 10) / 10;
        ctx.fillText("🏃", x + blur * 3, y);
        ctx.restore();
    });

    // Z — Sleeping enemies (draw Z above sleeping enemies)
    const sleepingEnemies = (state.enemies ?? []).filter(e => e.sleep_ticks > 0);
    sleepingEnemies.forEach(enemy => {
        const x = enemy.col * cell;
        const y = (enemy.row - 0.5) * cell;

        ctx.save();
        ctx.font = `${cell * 0.8}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // Animated Zzz
        const zOffset = Math.sin(Date.now() / 200) * 3;
        ctx.fillText("💤", x, y + zOffset);
        ctx.restore();
    });

    // C — Clone tank (rendered as enemy with special color)
    if (state.clone_tank) {
        // Clone is rendered via the normal tank rendering pipeline
        // Just add a visual indicator here if needed
    }

    // O — Octopus base shield
    if (state.base_shield_ticks > 0 && state.base_pos) {
        const { row, col } = state.base_pos;
        const x = col * cell + cell;
        const y = row * cell + cell;

        ctx.save();
        ctx.translate(x, y);

        // Pulsing shield
        const pulse = 0.8 + 0.2 * Math.sin(Date.now() / 150);
        ctx.fillStyle = `rgba(32, 178, 170, ${0.3 * pulse})`;
        ctx.beginPath();
        ctx.arc(0, 0, cell * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Shield ring
        ctx.strokeStyle = `rgba(32, 178, 170, ${0.6 * pulse})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, cell * 1.3, 0, Math.PI * 2);
        ctx.stroke();

        // Octopus emoji
        ctx.font = `${cell * 1.2}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🐙", 0, 0);

        ctx.restore();
    }

    // R — Rainbow world overlay
    if (state.rainbow_world_ticks > 0) {
        ctx.save();
        ctx.globalAlpha = 0.1 + 0.05 * Math.sin(Date.now() / 200);

        // Rainbow gradient overlay
        const gradient = ctx.createLinearGradient(0, 0, ctx.canvas.width, ctx.canvas.height);
        const hue = (Date.now() / 20) % 360;
        gradient.addColorStop(0, `hsla(${hue}, 100%, 50%, 0.3)`);
        gradient.addColorStop(0.5, `hsla(${(hue + 60) % 360}, 100%, 50%, 0.3)`);
        gradient.addColorStop(1, `hsla(${(hue + 120) % 360}, 100%, 50%, 0.3)`);

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        ctx.restore();
    }
}

export function renderAnts(ctx, state, cell) {
    (state.ants ?? []).forEach(ant => {
        const x = ant.col * cell;
        const y = ant.row * cell;

        ctx.save();
        // 2x bigger (was 0.7, now 1.4)
        const size = cell * 1.4;
        ctx.font = `${size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        ctx.translate(x, y);
        
        // Yellow Neon Glow
        ctx.shadowColor = "#FFFF00";
        ctx.shadowBlur = cell * 0.5;
        
        const t = Date.now() / 200;
        const wobble = Math.sin(t) * 0.1;
        ctx.rotate(wobble);

        ctx.fillText("🐜", 0, 0);

        if (ant.carrying) {
            // Render specific item: Sunflower (18) or Apple (92)
            const itemEmoji = ant.carried_tile === 18 ? "🌻" : "🍎";
            ctx.font = `${cell * 0.8}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.shadowBlur = 0; // no glow for the items themselves
            ctx.fillText(itemEmoji, -cell * 0.2, -cell * 0.4);
        }
        ctx.restore();
    });
}
