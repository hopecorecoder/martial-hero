import * as Phaser from 'phaser';

export class Cutscene2 extends Phaser.Scene {
    constructor() { super({ key: 'Cutscene2' }); }

    preload() {
        this.load.setPath('assets');
        this.load.image('background', 'background.png');
        this.load.image('floor', 'floor.png');
        this.load.spritesheet('char', 'Idle.png', { frameWidth: 200, frameHeight: 200 });
        this.load.spritesheet('boss_death', './enemies/final_boss/death.png', { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('boss_idle', './enemies/final_boss/idle.png', { frameWidth: 100, frameHeight: 100 });
    }

    create() {
        this.W = this.cameras.main.width;
        this.H = this.cameras.main.height;
        this.CX = this.W / 2;
        this.CY = this.H / 2;

        const safe = (key, cfg) => { if (!this.anims.exists(key)) this.anims.create(cfg); };
        safe('cs2_char_idle', { key:'cs2_char_idle', frames: this.anims.generateFrameNumbers('char',{start:0,end:7}), frameRate:7, repeat:-1 });
        safe('cs2_boss_idle', { key:'cs2_boss_idle', frames: this.anims.generateFrameNumbers('boss_idle',{start:0,end:3}), frameRate:5, repeat:-1 });
        safe('cs2_boss_die',  { key:'cs2_boss_die',  frames: this.anims.generateFrameNumbers('boss_death',{start:0,end:16}), frameRate:4.2, repeat:0 });

        this.physics.world.setBounds(0, 0, this.W, 2600);
        this.cameras.main.setBounds(0, 0, this.W, 2600);

        this.background = this.add.tileSprite(this.CX, this.CY, this.W, this.H, 'background').setScrollFactor(0);
        this.floorImg = this.add.tileSprite(this.CX, this.H, this.W, 110, 'floor').setOrigin(0.5, 1).setScrollFactor(0);

        this.dimRect = this.add.rectangle(this.CX, this.CY, this.W, this.H, 0x000000, 0).setDepth(1).setScrollFactor(0);

        this.boss = this.add.sprite(this.CX + 85, this.H - 185, 'boss_idle')
            .setScale(2.6)
            .setDepth(3)
            .setScrollFactor(0)
            .setFlipX(true);
        this.boss.anims.play('cs2_boss_idle', true);

        this._bossTween = this.tweens.add({
            targets: this.boss,
            y: this.boss.y - 14,
            duration: 1600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        this.player = this.physics.add.sprite(this.CX - 150, this.H - 142, 'char')
            .setScale(1.4)
            .setDepth(3)
            .setFlipX(false);
        this.player.body.setAllowGravity(false);
        this.player.anims.play('cs2_char_idle', true);

        const pg = this.make.graphics({ x:0, y:0, add:false });
        pg.fillStyle(0xffffff,1);
        pg.fillCircle(5,5,5);
        pg.generateTexture('cs2_particle', 10, 10);
        pg.clear();
        pg.fillStyle(0x000000,1);
        pg.fillCircle(8,8,8);
        pg.generateTexture('cs2_black', 16, 16);
        pg.destroy();

        this._dialogObj = null;
        this._speakerObj = null;
        this._dialogBox = null;
        this._typingEvent = null;
        this._blobs = null;
        this._blobTicker = 0;
        this._voidActive = false;
        this._fallState = false;

        this.cameras.main.fadeIn(800);
        this.time.delayedCall(900, () => this._startBossDeathSequence());
    }

    _startBossDeathSequence() {
        const lines = [
            { speaker: 'Reaper', text: 'Ugh... I... I can hear it now... the silence after all this death.', delay: 0, dur: 3400 },
            { speaker: 'Reaper', text: 'What have I done... what have I become...', delay: 3800, dur: 3000 },
            { speaker: 'Reaper', text: 'So many souls... stolen for a lie.', delay: 7300, dur: 2600 },
            { speaker: 'Reaper', text: 'Veronica... my child... they twisted my grief.', delay: 10400, dur: 3200 },
            { speaker: 'Reaper', text: 'I was never bringing you back... was I?', delay: 14100, dur: 3000 },
            { speaker: 'Reaper', text: 'Thank you... noble warrior.', delay: 17600, dur: 2800, deathLine: true },
            { speaker: 'Reaper', text: 'At last... let this end.', delay: 21000, dur: 2200 }
        ];

        this._blackMotes = this.add.particles(this.boss.x, this.boss.y, 'cs2_black', {
            speed: { min: 10, max: 55 },
            angle: { min: 215, max: 325 },
            scale: { start: 0.9, end: 0 },
            alpha: { start: 0.45, end: 0 },
            blendMode: 'NORMAL',
            lifespan: 1400,
            gravityY: -25,
            quantity: 2,
            frequency: 120,
            emitting: true
        }).setDepth(4).setScrollFactor(0);

        lines.forEach(({ speaker, text, delay, dur, deathLine }) => {
            this.time.delayedCall(delay, () => {
                this._showDialogue(speaker, text, dur);
                if (deathLine) this._triggerBossFinalThanks();
            });
        });

        this.time.delayedCall(24400, () => this._showVictoryOverlay());
    }

    _triggerBossFinalThanks() {
        if (this._bossTween) this._bossTween.stop();
        this.boss.anims.play('cs2_boss_die', true);

        this.boss.once('animationcomplete', () => {
            this.tweens.add({
                targets: this.boss,
                alpha: 0,
                y: this.boss.y - 22,
                duration: 1600,
                ease: 'Sine.easeIn',
                onComplete: () => {
                    if (this.boss.active) this.boss.destroy();
                    if (this._blackMotes?.active) this._blackMotes.destroy();
                    this._spawnBossDeathParticles();
                }
            });
        });
    }

    _spawnBossDeathParticles() {
        const bx = this.CX + 85, by = this.H - 185;
        const burst = this.add.particles(bx, by, 'cs2_particle', {
            speed: { min: 60, max: 180 },
            angle: { min: 0, max: 360 },
            scale: { start: 1.1, end: 0 },
            blendMode: 'ADD',
            lifespan: 1000,
            quantity: 26,
            tint: [0x220022, 0x550055, 0x999999],
            emitting: false
        }).setDepth(5).setScrollFactor(0);
        burst.explode(26);
        this.time.delayedCall(1100, () => { if (burst.active) burst.destroy(); });
    }

    _showVictoryOverlay() {
        this._clearDialogue();
        this.tweens.add({ targets: this.dimRect, alpha: 0.4, duration: 1000 });

        this._victoryTitle = this._typewriter(this.CX, this.CY - 60, 'VICTORY', {
            fontSize: '52px', fill: '#f5d060', stroke: '#1a0a00', strokeThickness: 8,
            fontFamily: 'monospace', fontStyle: 'bold',
            shadow: { x:0, y:0, color:'#ffcc00', blur:18, fill:true }
        }, 1000);

        this.time.delayedCall(1300, () => {
            this._victorySubtitle = this._typewriter(this.CX, this.CY + 18,
                'The Grim Reaper has fallen.',
                { fontSize:'16px', fill:'#ebe6d0', stroke:'#000000', strokeThickness:3, fontFamily:'monospace' },
                1600);
        });

        this._confetti = this.add.particles(this.CX, this.CY - 120, 'cs2_particle', {
            speed: { min: 40, max: 120 },
            angle: { min: 70, max: 110 },
            scale: { start: 0.55, end: 0.2 },
            lifespan: 1300,
            gravityY: 120,
            quantity: 3,
            frequency: 130,
            tint: [0xffd040, 0xffffff, 0xff6699, 0x66ccff]
        }).setDepth(8).setScrollFactor(0);

        this.time.delayedCall(1700, () => this._launchMiniFireworks());
        this.time.delayedCall(3400, () => this._launchMiniFireworks());

        this.time.delayedCall(5200, () => this._startShadowDialogue());
    }

    _launchMiniFireworks() {
        const x = Phaser.Math.Between(200, this.W - 200);
        const y = Phaser.Math.Between(120, 220);
        const burst = this.add.particles(x, y, 'cs2_particle', {
            speed: { min: 40, max: 210 },
            angle: { min: 0, max: 360 },
            scale: { start: 0.9, end: 0 },
            blendMode: 'ADD',
            lifespan: 900,
            quantity: 26,
            tint: [0xffd040, 0xffffff, 0x88ddff, 0xff88aa],
            emitting: false
        }).setDepth(8).setScrollFactor(0);
        burst.explode(26);
        this.time.delayedCall(1000, () => { if (burst.active) burst.destroy(); });
    }

    _startShadowDialogue() {
        this._clearVictoryOverlay();
        this.tweens.add({ targets: this.dimRect, alpha: 0.66, duration: 900 });

        this._blobs = [];
        const blobPositions = [
            { x: this.W - 130, y: this.H - 102 },
            { x: this.W - 70,  y: this.H - 100 }
        ];
        blobPositions.forEach((pos, i) => {
            const g = this.add.graphics().setDepth(6).setScrollFactor(0);
            this._drawStandingBlob(g, pos.x, pos.y, i);
            this._blobs.push({ gfx: g, baseX: pos.x, baseY: pos.y, idx: i, phase: Math.random() * Math.PI * 2 });
        });

        const convo = [
            { speaker: '???', text: 'He was a failure too.', delay: 1000 },
            { speaker: '???', text: 'All that grief, and still he broke before the end.', delay: 4200 },
            { speaker: '???', text: 'A useless puppet. Nothing more.', delay: 7600 },
            { speaker: '???', text: '...Wait.', delay: 10800 },
            { speaker: '???', text: 'The warrior is still here.', delay: 12800 },
            { speaker: '???', text: 'Then erase them.', delay: 15400 }
        ];

        convo.forEach(({ speaker, text, delay }) => {
            this.time.delayedCall(delay, () => {
                this._showDialogue(speaker, text, 2400, '#ff4466', '#ffb3bf');
                this._flashBlobs();
            });
        });

        this.time.delayedCall(17800, () => this._triggerVoidEnding());
    }

    _drawStandingBlob(g, cx, footY, idx) {
        g.clear();
        const bodyY = footY - 18;
        g.fillStyle(0x050505, 1);
        g.fillEllipse(cx, bodyY, 30, 24);
        g.fillRoundedRect(cx - 10, bodyY + 2, 20, 20, 7);
        g.fillRect(cx - 7, footY - 2, 5, 9);
        g.fillRect(cx + 2, footY - 2, 5, 9);
        g.lineStyle(2, 0x220022, 0.9);
        g.strokeEllipse(cx, bodyY, 30, 24);
        g.fillStyle(0xff0033, 0.95);
        g.fillCircle(cx - 5, bodyY - 3, 2.7);
        g.fillCircle(cx + 5, bodyY - 3, 2.7);
        g.fillStyle(0xffffff, 0.7);
        g.fillCircle(cx - 5, bodyY - 3, 1.1);
        g.fillCircle(cx + 5, bodyY - 3, 1.1);
    }

    _flashBlobs() {
        if (!this._blobs) return;
        this._blobs.forEach((b, i) => {
            const g = b.gfx;
            const cx = b.baseX;
            const footY = b.baseY;
            g.clear();
            const bodyY = footY - 18;
            g.fillStyle(0x0a0015, 1);
            g.fillEllipse(cx, bodyY, 30, 24);
            g.fillRoundedRect(cx - 10, bodyY + 2, 20, 20, 7);
            g.fillRect(cx - 7, footY - 2, 5, 9);
            g.fillRect(cx + 2, footY - 2, 5, 9);
            g.lineStyle(2, 0x660066, 1);
            g.strokeEllipse(cx, bodyY, 30, 24);
            g.fillStyle(0xff2200, 1);
            g.fillCircle(cx - 5, bodyY - 3, 4);
            g.fillCircle(cx + 5, bodyY - 3, 4);
            g.fillStyle(0xffffff, 0.95);
            g.fillCircle(cx - 5, bodyY - 3, 1.4);
            g.fillCircle(cx + 5, bodyY - 3, 1.4);
            this.time.delayedCall(260, () => {
                if (g.active) this._drawStandingBlob(g, cx, footY, i);
            });
        });
    }

    _triggerVoidEnding() {
        this._clearDialogue();
        this._voidActive = true;

        this.cameras.main.flash(150, 255, 0, 0, false);

        const holeX = this.player.x + 20;
        const holeY = this.H - 24;

        this.blackHole = this.add.graphics().setDepth(2);
        this.blackHole.fillStyle(0x000000, 1);
        this.blackHole.fillEllipse(holeX, holeY, 10, 4);
        this.blackHole.lineStyle(2, 0x220022, 0.8);
        this.blackHole.strokeEllipse(holeX, holeY, 14, 6);

        this.tweens.addCounter({
            from: 10,
            to: 210,
            duration: 900,
            ease: 'Cubic.easeOut',
            onUpdate: tween => {
                const v = tween.getValue();
                this.blackHole.clear();
                this.blackHole.fillStyle(0x000000, 1);
                this.blackHole.fillEllipse(holeX, holeY, v, Math.max(8, v * 0.22));
                this.blackHole.lineStyle(3, 0x2d003a, 0.9);
                this.blackHole.strokeEllipse(holeX, holeY, v + 16, Math.max(10, v * 0.26));
            }
        });

        const voidParticles = this.add.particles(holeX, holeY - 10, 'cs2_black', {
            speed: { min: 20, max: 120 },
            angle: { min: 0, max: 360 },
            scale: { start: 0.8, end: 0 },
            alpha: { start: 0.55, end: 0 },
            lifespan: 1000,
            quantity: 3,
            frequency: 45,
            tint: [0x000000, 0x110011, 0x220022]
        }).setDepth(2);

        this.time.delayedCall(650, () => {
            this._startFallThroughVoid(holeX, holeY, voidParticles);
        });
    }

    _startFallThroughVoid(holeX, holeY, voidParticles) {
        this._fallState = true;
        this.floorImg.setVisible(false);
        if (this._blobs) this._blobs.forEach(b => b.gfx.setVisible(false));
        this.background.setVisible(false);
        this.player.setDepth(20);
        this.player.body.setAllowGravity(false);

        this.voidBackdrop = this.add.rectangle(this.CX, 1300, this.W, 2600, 0x000000, 1).setDepth(0);
        this.voidStars = this.add.particles(this.CX, 1300, 'cs2_particle', {
            speed: { min: 10, max: 70 },
            angle: { min: 85, max: 95 },
            scale: { start: 0.25, end: 0 },
            alpha: { start: 0.3, end: 0 },
            lifespan: 2200,
            quantity: 2,
            frequency: 55,
            tint: [0x555555, 0x222222, 0x111111]
        }).setDepth(1);

        this.player.setPosition(holeX, this.H - 50);
        this.player.setVelocity(0, 0);
        this.player.anims.stop();

        this.cameras.main.stopFollow();
        this.cameras.main.startFollow(this.player, true, 0.08, 0.08);

        this.tweens.add({
            targets: this.player,
            y: this.player.y + 1350,
            angle: 780,
            duration: 3000,
            ease: 'Cubic.easeIn'
        });

        this.tweens.add({
            targets: this.player,
            x: this.player.x - 90,
            duration: 3000,
            ease: 'Sine.easeInOut'
        });

        this.time.delayedCall(3000, () => {
            this.player.setVisible(false);
            this.cameras.main.stopFollow();
            if (voidParticles?.active) voidParticles.destroy();
            if (this.blackHole?.active) this.blackHole.destroy();
            this._showEndCard();
        });
    }

    _showEndCard() {
        const cam = this.cameras.main;
        const text = this.add.text(cam.scrollX + this.W / 2, cam.scrollY + this.H / 2, 'TO BE CONTINUED...', {
            fontSize: '28px',
            fill: '#9a9a9a',
            stroke: '#000000',
            strokeThickness: 4,
            fontFamily: 'monospace',
            fontStyle: 'bold'
        }).setOrigin(0.5).setAlpha(0).setDepth(40);

        this.tweens.add({
            targets: text,
            alpha: 1,
            duration: 1600,
            ease: 'Sine.easeInOut'
        });
    }

    _showDialogue(speaker, text, duration = 2600, speakerColor = '#cc99ff', textColor = '#f0eedd') {
        this._clearDialogue();

        const boxY = 48;
        this._dialogBox = this.add.graphics().setDepth(70).setScrollFactor(0);
        this._dialogBox.fillStyle(0x08000f, 0.88);
        this._dialogBox.fillRoundedRect(this.W / 2 - 320, boxY - 10, 640, 70, 8);
        this._dialogBox.lineStyle(1, 0x6600aa, 0.7);
        this._dialogBox.strokeRoundedRect(this.W / 2 - 320, boxY - 10, 640, 70, 8);

        this._speakerObj = this.add.text(this.W / 2 - 300, boxY, speaker + ':', {
            fontSize: '13px', fill: speakerColor, fontFamily: 'monospace', fontStyle: 'bold',
            stroke: '#000000', strokeThickness: 3
        }).setDepth(71).setScrollFactor(0);

        this._dialogObj = this.add.text(this.W / 2 - 300, boxY + 20, '', {
            fontSize: '15px', fill: textColor, fontFamily: 'monospace',
            stroke: '#050005', strokeThickness: 3, wordWrap: { width: 590 }
        }).setDepth(71).setScrollFactor(0);

        let i = 0;
        const perChar = Math.min(58, duration / Math.max(1, text.length));
        this._typingEvent = this.time.addEvent({
            delay: perChar,
            repeat: Math.max(0, text.length - 1),
            callback: () => { if (this._dialogObj?.active) this._dialogObj.setText(text.substring(0, ++i)); }
        });
    }

    _clearDialogue() {
        if (this._typingEvent) { this._typingEvent.remove(); this._typingEvent = null; }
        if (this._dialogBox?.active) { this._dialogBox.destroy(); this._dialogBox = null; }
        if (this._speakerObj?.active) { this._speakerObj.destroy(); this._speakerObj = null; }
        if (this._dialogObj?.active) { this._dialogObj.destroy(); this._dialogObj = null; }
    }

    _typewriter(x, y, text, style, duration = 1600) {
        const obj = this.add.text(x, y, '', { ...style }).setOrigin(0.5).setScrollFactor(0).setDepth(72);
        let i = 0;
        const perChar = duration / Math.max(1, text.length);
        this.time.addEvent({
            delay: perChar,
            repeat: Math.max(0, text.length - 1),
            callback: () => { if (obj?.active) obj.setText(text.substring(0, ++i)); }
        });
        return obj;
    }

    _clearVictoryOverlay() {
        if (this._victoryTitle?.active) this._victoryTitle.destroy();
        if (this._victorySubtitle?.active) this._victorySubtitle.destroy();
        if (this._confetti?.active) this._confetti.destroy();
        this._victoryTitle = null;
        this._victorySubtitle = null;
        this._confetti = null;
    }

    update(time, delta) {
        if (this._blackMotes?.active && this.boss?.active) {
            this._blackMotes.setPosition(this.boss.x, this.boss.y + 6);
        }

        if (!this._blobs || this._fallState) return;
        this._blobTicker += delta * 0.0024;
        this._blobs.forEach((b, i) => {
            if (!b.gfx.active) return;
            const footY = b.baseY + Math.sin(this._blobTicker + b.phase) * 2.5;
            this._drawStandingBlob(b.gfx, b.baseX, footY, i);
        });
    }
}