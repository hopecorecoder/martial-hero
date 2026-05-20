import * as Phaser from 'phaser';

"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// Platform registry  { x: centre, y: top-surface, w: half-width }
// ─────────────────────────────────────────────────────────────────────────────
const PLATFORMS = [
    // Zone 1
    { x: 750,  y: 355, w: 100 },
    { x: 825,  y: 355, w: 100 },
    { x: 900,  y: 235, w: 100 },
    { x: 980,  y: 155, w: 100 },
    { x: 1100, y: 295, w: 100 },
    { x: 1200, y: 325, w: 100 },
    // Zone 2
    { x: 1800, y: 380, w: 100 },
    { x: 2000, y: 300, w: 100 },  // p5 plat3
    { x: 2100, y: 150, w: 100 },  // p4
    { x: 2175, y: 150, w: 100 },  // p6
    { x: 2300, y: 200, w: 100 },  // p3
    { x: 2400, y: 320, w: 100 },  // p8
    { x: 2525, y: 400, w: 100 },  // p2 plat2
];

const FLOOR_Y = 490;

function nearestPlatformTo(px, py) {
    let best = null, bestD = Infinity;
    for (const p of PLATFORMS) {
        const d = Math.hypot(p.x - px, p.y - py);
        if (d < bestD) { bestD = d; best = p; }
    }
    return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Enemy
// ─────────────────────────────────────────────────────────────────────────────
class Enemy {
    constructor(scene, x, y, type) {
        this.scene          = scene;
        this.type           = type;
        this.dead           = false;
        this.aggroed        = false;
        this.aggroTimer     = 0;
        this.aggroRange     = 350;
        this.attackCooldown = 0;
        this.animLocked     = false;
        this.attacking      = false;
        this.invincible     = false;
        this.alertShown     = false;

        // Burn status
        this.burning        = false;
        this.burnDamage     = 0;
        this.burnTimer      = 0;
        this.burnDuration   = 0;
        this.burnParticles  = null;

        // Ground-enemy relocate timer
        this._relocateTimer = 4000;
        this._relocating    = false;

        switch (type) {
            case 'goblin':
                this.maxHp = 100; this.speed = 90;  this.damage = 40; this.attackRange = 75;
                this.idleKey = 'enemy_idle'; this.runKey = 'enemy_run';
                this.attackKey = 'enemy_attack'; this.hitKey = 'enemy_take_hit';
                this.dieKey = 'enemy_die'; this.initTexture = 'enemy1_idle';
                break;
            case 'flyeye':
                this.maxHp = 70;  this.speed = 120; this.damage = 30; this.attackRange = 100;
                this.idleKey = 'flyeye_fly'; this.runKey = 'flyeye_fly';
                this.attackKey = 'flyeye_attack'; this.hitKey = 'flyeye_hit';
                this.dieKey = 'flyeye_die'; this.initTexture = 'enemy2_fly';
                this.aggroRange = 700;
                break;
            case 'skeleton':
                this.maxHp = 130; this.speed = 70;  this.damage = 50; this.attackRange = 75;
                this.idleKey = 'skel_idle'; this.runKey = 'skel_run';
                this.attackKey = 'skel_attack'; this.hitKey = 'skel_hit';
                this.dieKey = 'skel_die'; this.initTexture = 'enemy3_idle';
                break;
        }
        this.hp        = this.maxHp;
        this.baseSpeed = this.speed;

        this.sprite = scene.physics.add.sprite(x, y, this.initTexture);
        this.sprite.setScale(1.4);
        this.sprite.setCollideWorldBounds(true);
        this.sprite.setBounce(0.0);
        this.sprite.body.setSize(40, 40);
        this.sprite.body.setOffset(55, 60);

        if (type === 'flyeye') {
            this.sprite.body.setAllowGravity(false);
        }

        this.hpBg  = scene.add.graphics().setDepth(8);
        this.hpBar = scene.add.graphics().setDepth(9);

        this.alertSprite = scene.add.image(x, y - 95, 'alert')
            .setScale(0.08).setVisible(false).setDepth(7);

        this.sprite.anims.play(this.idleKey, true);

        this.sprite.on('animationcomplete', (anim) => {
            if (this.dead) return;
            if (anim.key === this.attackKey) {
                this.attacking  = false;
                this.animLocked = false;
                this.sprite.anims.play(this.idleKey, true);
            }
            if (anim.key === this.hitKey) {
                this.animLocked = false;
                this.sprite.anims.play(this.aggroed ? this.runKey : this.idleKey, true);
            }
        });
    }

    _drawHpBar() {
        if (!this.hpBg || !this.hpBar || !this.hpBg.active || !this.hpBar.active) return;
        const bw = 60, bh = 7;
        const ex = this.sprite.x - bw / 2;
        const ey = this.sprite.y - 78;
        this.hpBg.clear();
        this.hpBg.fillStyle(0x000000, 0.7);
        this.hpBg.fillRect(ex - 1, ey - 1, bw + 2, bh + 2);
        this.hpBar.clear();
        const ratio = Math.max(0, this.hp / this.maxHp);
        const color = ratio > 0.5 ? 0xff2222 : ratio > 0.25 ? 0xff8800 : 0xff0000;
        this.hpBar.fillStyle(color, 1);
        this.hpBar.fillRect(ex, ey, bw * ratio, bh);
        this.hpBar.fillStyle(0xff6666, 0.5);
        this.hpBar.fillRect(ex, ey + 1, bw * ratio, 2);
    }

    showAlert() {
        if (this.alertShown) return;
        this.alertShown = true;
        this.alertSprite.setVisible(true).setAlpha(1);
        const startY = this.alertSprite.y;
        this.scene.tweens.add({
            targets: this.alertSprite, y: startY - 16,
            duration: 160, yoyo: true, repeat: 2, ease: 'Sine.easeOut',
            onComplete: () => {
                this.alertSprite.setPosition(this.sprite.x, this.sprite.y - 95);
                this.scene.time.delayedCall(1200, () => {
                    this.scene.tweens.add({
                        targets: this.alertSprite, alpha: 0, duration: 350,
                        onComplete: () => this.alertSprite.setVisible(false)
                    });
                });
            }
        });
    }

    applyBurn(damage, duration) {
        if (!this.burning) {
            this.burning      = true;
            this.burnDamage   = damage;
            this.burnDuration = duration;
            this.burnTimer    = 0;
            this.speed        = this.baseSpeed * 1.3;
            this.burnParticles = this.scene.add.particles(this.sprite.x, this.sprite.y, 'particle', {
                speed: { min: 20, max: 40 },
                angle: { min: 0, max: 360 },
                scale: { start: 0.6, end: 0 },
                blendMode: 'ADD',
                lifespan: 400,
                gravityY: -50,
                quantity: 2,
                tint: 0xff3300,
                frequency: 100
            }).setDepth(7);
        }
    }

    _updateBurn(delta) {
        if (!this.burning) return;
        this.burnTimer += delta;
        if (Math.floor(this.burnTimer / 500) > Math.floor((this.burnTimer - delta) / 500)) {
            this.hp = Math.max(0, this.hp - this.burnDamage);
            this._drawHpBar();
           
            if (this.hp <= 0) {
                this._die();
                if (this.scene._checkVictory) this.scene._checkVictory();
            }
        }
        if (this.burnParticles && this.burnParticles.active) {
            this.burnParticles.setPosition(this.sprite.x, this.sprite.y);
        }
        if (this.burnTimer >= this.burnDuration) {
            this.burning = false;
            this.speed   = this.baseSpeed;
            if (this.burnParticles) {
                this.burnParticles.destroy();
                this.burnParticles = null;
            }
        }
    }

    takeDamage(dmg, knockbackDir, isMelee = false) {
        if (this.dead || this.invincible) return false;
        let finalDamage = dmg;
        if (this.burning && isMelee) finalDamage = dmg * 1.5;

        this.hp = Math.max(0, this.hp - finalDamage);
        this._drawHpBar();

        this.sprite.setVelocityX(knockbackDir * 230);
        this.sprite.setTintFill(0xffffff);
        this.scene.time.delayedCall(110, () => { if (!this.dead) this.sprite.clearTint(); });

        this.invincible = true;
        this.scene.time.delayedCall(300, () => { this.invincible = false; });

        if (this.hp <= 0) { this._die(); return true; }

        if (!this.animLocked) {
            this.animLocked = true;
            this.attacking  = false;
            this.sprite.anims.play(this.hitKey, true);
        }
        return false;
    }

    _die() {
        this.dead = true;
        this.sprite.setVelocityX(0);
        this.sprite.setVelocityY(0);
        this.sprite.body.setEnable(false);
        this.animLocked = true;

        if (this.hpBg)  { this.hpBg.destroy();  this.hpBg = null; }
        if (this.hpBar) { this.hpBar.destroy(); this.hpBar = null; }
        if (this.alertSprite?.active) this.alertSprite.destroy();
        if (this.burnParticles?.active) {
            this.burnParticles.destroy();
            this.burnParticles = null;
        }

        this.sprite.anims.play(this.dieKey, true);

        this._deathDone = false;

        this.sprite.once('animationcomplete', () => {
            if (this._deathDone) return;
            this._deathDone = true;
            this.scene.time.delayedCall(350, () => {
                if (this.sprite?.active) this.sprite.destroy();
            });
        });

        this.scene.time.delayedCall(1000, () => {
            if (this._deathDone) return;
            this._deathDone = true;
            if (this.sprite?.active) this.sprite.destroy();
        });
        if (this.scene._dropPotion) {
            this.scene._dropPotion(this.sprite.x, this.sprite.y);
        }
    }

    _updateFlyeye(delta, player) {
        if (this._relocating) return;
        const dx = player.x - this.sprite.x;
        const dy = player.y - this.sprite.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > this.attackRange) {
            this.sprite.setVelocityX((dx / len) * this.speed);
            this.sprite.setVelocityY((dy / len) * this.speed);
            this.sprite.setFlipX(dx < 0);
            if (!this.attacking) this.sprite.anims.play(this.runKey, true);
        } else {
            this.sprite.setVelocityX(0);
            this.sprite.setVelocityY(0);
            this._doAttack(delta, player);
        }
    }

    _updateGround(delta, player) {
        if (this._relocating) return;
        const dist = Phaser.Math.Distance.Between(
            this.sprite.x, this.sprite.y, player.x, player.y
        );
        if (dist > this.attackRange) {
            if (!this.animLocked) {
                const dir = player.x > this.sprite.x ? 1 : -1;
                this.sprite.setVelocityX(dir * this.speed);
                this.sprite.setFlipX(dir === -1);
                this.sprite.anims.play(this.runKey, true);
            }
        } else {
            if (!this.animLocked) {
                this.sprite.setVelocityX(0);
                this._doAttack(delta, player);
            }
        }
        this._relocateTimer -= delta;
        if (this._relocateTimer <= 0) {
            this._relocateTimer = 4000;
            const yDiff = Math.abs(this.sprite.y - player.y);
            if (yDiff > 10) this._doRelocate(player);
        }
    }

    _doRelocate(player) {
        this._relocating = true;
        const plat  = nearestPlatformTo(player.x, player.y);
        const destX = plat.x + Phaser.Math.Between(-30, 30);
        const destY = plat.y - 20;
        this.sprite.setVelocityX(0);
        this.sprite.setVelocityY(0);
        this.scene.tweens.add({
            targets: this.sprite, alpha: 0, duration: 200,
            onComplete: () => {
                if (this.dead) { this._relocating = false; return; }
                this.sprite.setPosition(destX, destY);
                this.scene.tweens.add({
                    targets: this.sprite, alpha: 1, duration: 200,
                    onComplete: () => { this._relocating = false; }
                });
            }
        });
    }

    _doAttack(delta, player) {
        this.attackCooldown -= delta;
        if (this.attackCooldown <= 0 && !this.attacking) {
            this.attacking  = true;
            this.animLocked = true;
            this.sprite.anims.play(this.attackKey, true);
            this.attackCooldown = Phaser.Math.Between(1100, 1700);
            this.scene.time.delayedCall(420, () => {
                if (this.dead) return;
                const d2 = Phaser.Math.Distance.Between(
                    this.sprite.x, this.sprite.y, player.x, player.y
                );
                if (d2 < this.attackRange + 25) this.scene._enemyHitPlayer(this.damage);
            });
        } else if (!this.attacking) {
            this.sprite.anims.play(this.idleKey, true);
        }
    }

    update(delta, player) {
        if (this.dead) return;
        this._updateBurn(delta);
        if (this.alertSprite.active && this.alertSprite.visible) {
            this.alertSprite.setPosition(this.sprite.x, this.sprite.y - 95);
        }
        const dx = Math.abs(player.x - this.sprite.x);
        const dy = Math.abs(player.y - this.sprite.y);
        const inSight = dx < this.aggroRange && dy < 250;
        if (!this.aggroed) {
            if (inSight) {
                this.aggroTimer += delta;
                if (this.aggroTimer >= 900) {
                    this.aggroed = true;
                    this.showAlert();
                    if (this.scene._lockArena) this.scene._lockArena();
                }
            } else {
                this.aggroTimer = 0;
            }
        }
        this._drawHpBar();
        if (!this.aggroed) {
            this.sprite.setVelocityX(0);
            if (this.type === 'flyeye') this.sprite.setVelocityY(0);
            if (!this.animLocked) this.sprite.anims.play(this.idleKey, true);
            return;
        }
        if (this.type === 'flyeye') {
            this._updateFlyeye(delta, player);
        } else {
            this._updateGround(delta, player);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Level2Scene
// ─────────────────────────────────────────────────────────────────────────────
export class Level2Scene extends Phaser.Scene {
    constructor() {
        super({ key: 'Level2Scene' });
    }
    
    preload() {
        this.load.setPath('assets');
        this.load.image('potion', 'potion.png');
        this.load.spritesheet('enemy1_idle',     './enemies/Goblin/Idle.png',         { frameWidth: 150, frameHeight: 150 });
        this.load.spritesheet('enemy1_attack',   './enemies/Goblin/Attack1.png',      { frameWidth: 150, frameHeight: 150 });
        this.load.spritesheet('enemy1_take_hit', './enemies/Goblin/Take Hit.png',     { frameWidth: 150, frameHeight: 150 });
        this.load.spritesheet('enemy1_die',      './enemies/Goblin/Death.png',        { frameWidth: 150, frameHeight: 150 });
        this.load.spritesheet('enemy1_run',      './enemies/Goblin/Run.png',          { frameWidth: 150, frameHeight: 150 });

        this.load.spritesheet('enemy2_fly',      './enemies/Flying eye/Flight.png',   { frameWidth: 150, frameHeight: 150 });
        this.load.spritesheet('enemy2_attack',   './enemies/Flying eye/Attack.png',   { frameWidth: 150, frameHeight: 150 });
        this.load.spritesheet('enemy2_take_hit', './enemies/Flying eye/Take Hit.png', { frameWidth: 150, frameHeight: 150 });
        this.load.spritesheet('enemy2_die',      './enemies/Flying eye/Death.png',    { frameWidth: 150, frameHeight: 150 });

        this.load.spritesheet('enemy3_idle',     './enemies/Skeleton/Idle.png',       { frameWidth: 150, frameHeight: 150 });
        this.load.spritesheet('enemy3_attack',   './enemies/Skeleton/Attack.png',     { frameWidth: 150, frameHeight: 150 });
        this.load.spritesheet('enemy3_take_hit', './enemies/Skeleton/Take Hit.png',   { frameWidth: 150, frameHeight: 150 });
        this.load.spritesheet('enemy3_die',      './enemies/Skeleton/Death.png',      { frameWidth: 150, frameHeight: 150 });
        this.load.spritesheet('enemy3_run',      './enemies/Skeleton/Walk.png',       { frameWidth: 150, frameHeight: 150 });

        this.load.image('alert',      'alert.png');
        this.load.spritesheet('attack', 'Attack1.png', { frameWidth: 200, frameHeight: 200 });

        this.load.image('sword',      'blade.png');
        this.load.image('plat1',      'tileset.png');
        this.load.image('plat2',      'long_platform.png');
        this.load.image('plat3',      'plaform.png');

        this.load.spritesheet('run',  'Run.png',  { frameWidth: 200, frameHeight: 200 });
        this.load.spritesheet('jump', 'Jump.png', { frameWidth: 200, frameHeight: 200 });

        this.load.image('background', 'background.png');
        this.load.image('floor',      'floor.png');
        this.load.spritesheet('char', 'Idle.png', { frameWidth: 200, frameHeight: 200 });

        this.load.image('scroll',        'scroll.png');
        this.load.spritesheet('skills', 'skills.png', {frameWidth : 24, frameHeight:24});
        this.load.image('flame',         'flame.png');
    }

    create() {
        this.physics.world.setBounds(0, 0, 3600, 600);
        this.add.tileSprite(1800, 300, 3600, 600, 'background');

        const floor = this.add.tileSprite(1800, 600, 3600, 110, 'floor').setOrigin(0.5, 1);
        this.physics.add.existing(floor, true);
        floor.body.setSize(3600, 110);
        floor.body.updateFromGameObject();

        this.keys = this.input.keyboard.addKeys({
            left:     Phaser.Input.Keyboard.KeyCodes.A,
            right:    Phaser.Input.Keyboard.KeyCodes.D,
            up:       Phaser.Input.Keyboard.KeyCodes.SPACE,
            down:     Phaser.Input.Keyboard.KeyCodes.S,
            fireball: Phaser.Input.Keyboard.KeyCodes.F,
            strike:   Phaser.Input.Keyboard.KeyCodes.W
        });

        // ── Player ───────────────────────────────────────────────────────────
        this.player = this.physics.add.sprite(100, 450, 'char');
        this.player.setBounce(0.2);
        this.player.setScale(1.4);
        this.player.setCollideWorldBounds(true);
        this.player.body.setSize(40, 40);
        this.player.body.setOffset(80, 80);

        this.hasSecondSkill = false;
        this.inCombat          = false;
        this.isAttacking       = false;
        this.isCharging        = false;
        this.chargeAmount      = 0;
        this.maxChargeTime     = 0.4;
        this.chargeBar         = null;
        this.chargeBarBg       = null;

        this.playerHealth      = 500;
        this.playerMaxHealth   = 500;
        this.playerInvincible  = false;

        this.hasSword          = true;
        this.lastTapRight      = 0;
        this.lastTapLeft       = 0;
        this.isDashing         = false;
        this.dashCooldown      = 0;
        this.dashCooldownMax   = 900;
        this.gamePaused        = false;

        // Fireball skill state
        this.hasFireball          = false;
        this.fireballCooldown     = 0;
        this.fireballCooldownMax  = 2000;
        this.fireballs            = [];

        // Arena lock state
        this.arenaLocked          = false;
        this.arenaWalls           = null;

        // Movement tracking for arrow prompt
        this.fireballAcquiredTime = 0;
        this.arrowPrompt          = null;
        this.hasMovedRight        = false;
        this.secondAreaTriggered  = false;
        this.firstVictory         = false;
        this.potions = [];
        this.wave2Enemies         = [];
        this.secondVictoryTriggered = false;

        // ── Platforms (first area) ────────────────────────────────────────────
        this.platforms = this.physics.add.staticGroup();

        const w1 = this.platforms.create(750, 380, 'plat1');
        w1.body.setSize(w1.width, 50); w1.body.setOffset(0, 0); w1.refreshBody();

        const dA = this.platforms.create(900, 260, 'plat1');
        dA.body.setSize(200, 50); dA.refreshBody();

        const dB = this.platforms.create(1100, 320, 'plat1');
        dB.body.setSize(200, 50); dB.refreshBody();

        const hi = this.platforms.create(980, 180, 'plat1');
        hi.body.setSize(200, 50); hi.refreshBody();

        const w2 = this.platforms.create(1200, 350, 'plat2');
        w2.body.setSize(w2.width, 50); w2.body.setOffset(0, 0); w2.refreshBody();

        const far = this.platforms.create(825, 380, 'plat1');
        far.body.setSize(200, 50); far.refreshBody();

        // ── Animations ───────────────────────────────────────────────────────
        const safe = (key, cfg) => { if (!this.anims.exists(key)) this.anims.create(cfg); };

        safe('idle',   { key:'idle',   frames: this.anims.generateFrameNumbers('char',{start:0,end:7}),            frameRate:8,  repeat:-1 });
        safe('left',   { key:'left',   frames: this.anims.generateFrameNumbers('run', {start:0,end:7}),            frameRate:10, repeat:-1 });
        safe('right',  { key:'right',  frames: this.anims.generateFrameNumbers('run', {start:0,end:7}),            frameRate:10, repeat:-1 });
        safe('attack', { key:'attack', frames: this.anims.generateFrameNumbers('attack',{start:0,end:5}),          frameRate:10, repeat:0  });

        safe('enemy_idle',     { key:'enemy_idle',     frames: this.anims.generateFrameNumbers('enemy1_idle',    {start:0,end:3}), frameRate:8,  repeat:-1 });
        safe('enemy_run',      { key:'enemy_run',      frames: this.anims.generateFrameNumbers('enemy1_run',     {start:0,end:7}), frameRate:10, repeat:-1 });
        safe('enemy_attack',   { key:'enemy_attack',   frames: this.anims.generateFrameNumbers('enemy1_attack',  {start:0,end:7}), frameRate:10, repeat:0  });
        safe('enemy_take_hit', { key:'enemy_take_hit', frames: this.anims.generateFrameNumbers('enemy1_take_hit',{start:0,end:3}), frameRate:10, repeat:0  });
        safe('enemy_die',      { key:'enemy_die',      frames: this.anims.generateFrameNumbers('enemy1_die',     {start:0,end:3}), frameRate:8,  repeat:0  });

        safe('flyeye_fly',    { key:'flyeye_fly',    frames: this.anims.generateFrameNumbers('enemy2_fly',      {start:0,end:7}), frameRate:10, repeat:-1 });
        safe('flyeye_attack', { key:'flyeye_attack', frames: this.anims.generateFrameNumbers('enemy2_attack',   {start:0,end:7}), frameRate:10, repeat:0  });
        safe('flyeye_hit',    { key:'flyeye_hit',    frames: this.anims.generateFrameNumbers('enemy2_take_hit', {start:0,end:3}), frameRate:10, repeat:0  });
        safe('flyeye_die',    { key:'flyeye_die',    frames: this.anims.generateFrameNumbers('enemy2_die',      {start:0,end:3}), frameRate:8,  repeat:0  });

        safe('skel_idle',   { key:'skel_idle',   frames: this.anims.generateFrameNumbers('enemy3_idle',    {start:0,end:3}), frameRate:8,  repeat:-1 });
        safe('skel_run',    { key:'skel_run',    frames: this.anims.generateFrameNumbers('enemy3_run',     {start:0,end:3}), frameRate:10, repeat:-1 });
        safe('skel_attack', { key:'skel_attack', frames: this.anims.generateFrameNumbers('enemy3_attack',  {start:0,end:7}), frameRate:10, repeat:0  });
        safe('skel_hit',    { key:'skel_hit',    frames: this.anims.generateFrameNumbers('enemy3_take_hit',{start:0,end:3}), frameRate:10, repeat:0  });
        safe('skel_die',    { key:'skel_die',    frames: this.anims.generateFrameNumbers('enemy3_die',     {start:0,end:3}), frameRate:8,  repeat:0  });

        // ── Spawn data (first area) ───────────────────────────────────────────
        this._landSpawnPool = [
            { type:'goblin',   x: 730,  y: FLOOR_Y - 60 },
            { type:'goblin',   x: 1090, y: 295          },
            { type:'goblin',   x: 1170, y: FLOOR_Y - 60 },
            { type:'skeleton', x: 850,  y: FLOOR_Y - 60 },
            { type:'skeleton', x: 1010, y: FLOOR_Y - 60 },
            { type:'skeleton', x: 1130, y: FLOOR_Y - 60 },
        ];
        this._flySpawnPool = [
            { x: 910, y: 200 },
            { x: 990, y: 130 },
            { x: 1190,y: 290 },
            { x: 1130,y: 250 },
        ];

        this.enemies        = [];
        this._landKillCount = 0;
        this._reinforceSent = false;
        this._floor         = floor;

        const landShuffled = Phaser.Utils.Array.Shuffle(this._landSpawnPool.slice()).slice(0, 3);
        landShuffled.forEach(s => this._spawnEnemy(s.type, s.x, s.y));

        const flyShuffled = Phaser.Utils.Array.Shuffle(this._flySpawnPool.slice()).slice(0, 3);
        flyShuffled.forEach(s => this._spawnEnemy('flyeye', s.x, s.y));

        const usedLandKeys = new Set(landShuffled.map(s => `${s.type}${s.x}`));
        this._remainLandPool = this._landSpawnPool.filter(s => !usedLandKeys.has(`${s.type}${s.x}`));
        const usedFlyKeys    = new Set(flyShuffled.map(s => `${s.x}`));
        this._remainFlyPool  = this._flySpawnPool.filter(s => !usedFlyKeys.has(`${s.x}`));

        // ── Player HP bar ─────────────────────────────────────────────────────
        this.playerHpGraphics = this.add.graphics().setScrollFactor(0).setDepth(20);
        this._drawPlayerHpBar();

        // ── Dash cooldown bar ─────────────────────────────────────────────────
        this.dashCdGraphics = this.add.graphics().setScrollFactor(0).setDepth(20);
        this.dashCdLabel = this.add.text(590, 70, 'DASH', {
            fontSize: '10px', fill: '#aaddff',
            stroke: '#000000', strokeThickness: 2, fontFamily: 'monospace'
        }).setScrollFactor(0).setDepth(21);
        this._drawDashCooldown(1);

        // ── Fireball icon UI ──────────────────────────────────────────────────
        this.fireballIcon =  this.add.image(730, 90, 'skills', 44).setDepth(50);
        this.fireballIconOverlay = this.add.graphics().setScrollFactor(0).setDepth(21);
        this.fireballIcon.setScale(1.4);
        this.fireballIcon.setScrollFactor(0).setDepth(20);
        this.fireballIcon.setVisible(false);


        // ── judgement icon UI ──────────────────────────────────────────────────
        this.judgementIcon =  this.add.image(690, 90, 'skills', 27).setDepth(50);
        this.judgementIconOverlay = this.add.graphics().setScrollFactor(0).setDepth(21);
        this.judgementIcon.setScale(1.4);
        this.judgementIcon.setScrollFactor(0).setDepth(20);
        this.judgementIcon.setVisible(false);

      

        // ── Camera / colliders ────────────────────────────────────────────────
        this.player.anims.play('idle');
        this.cameras.main.centerOn(this.player.x, this.player.y);
        this.cameras.main.startFollow(this.player, true, 0.26, 0.26);
        this.cameras.main.setBounds(0, 0, 3600, 600);
        this.cameras.main.fadeIn(600);

        this.physics.add.collider(this.player, floor);
        this.physics.add.collider(this.player, this.platforms);

        // Particle texture
        const gfx = this.make.graphics({ x: 0, y: 0, add: false });
        gfx.fillStyle(0xffffff, 1);
        gfx.fillCircle(4, 4, 4);
        gfx.generateTexture('particle', 8, 8);
        gfx.destroy();

        // ── Attack ────────────────────────────────────────────────────────────
        this.input.on('pointerdown', (pointer) => {
            if (pointer.leftButtonDown() &&
                !this.isAttacking &&
                this.hasSword &&
                !this.gamePaused &&
                !this.jCharging) {
                this.isAttacking = true;
                this.player.setVelocityX(0);
                this.player.anims.play('attack');
                this._tryHitEnemies();
            }
        });
        this.player.on('animationcomplete', (anim) => {
            if (anim.key === 'attack') this.isAttacking = false;
        });

        // ── HUD text ──────────────────────────────────────────────────────────
        this.dashTutorial = this.add.text(400, 130, 'Double-tap A / D to dash', {
            fontSize: '24px', fill: '#aaddff',
            stroke: '#000000', strokeThickness: 4, align: 'center'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(25).setAlpha(0);

        this.tweens.add({
            targets: this.dashTutorial, alpha: 1, duration: 500, delay: 400,
            onComplete: () => {
                this.time.delayedCall(3000, () => {
                    this.tweens.add({ targets: this.dashTutorial, alpha: 0, duration: 600 });
                });
            }
        });

        // Natural regen
        this.time.addEvent({
            delay: 2500,
            loop: true,
            callback: () => {
                if (!this.inCombat && !this.jHealBlocked && this.playerHealth < this.playerMaxHealth) {
                    this.playerHealth = Math.min(this.playerMaxHealth, this.playerHealth + 10);
                    this._drawPlayerHpBar();
                    this._playHealEffect();
                }
            }
        });

        const lvlTitle = this.add.text(400, 50, 'Level 2 — The hunt begins', {
            fontSize: '22px', fill: '#ffffff',
            stroke: '#000000', strokeThickness: 3, align: 'center'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
        this.time.delayedCall(2000, () => {
            this.tweens.add({ targets: lvlTitle, alpha: 0, duration: 600 });
        });

        // Strike of Judgement setup
        this._initJudgement();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Arena helpers
    // ─────────────────────────────────────────────────────────────────────────
    _lockArena() {
        if (this.arenaLocked) return;
        this.arenaLocked = true;
        this.arenaWalls = this.physics.add.staticGroup();
        const leftWall = this.arenaWalls.create(50, 300, null);
        leftWall.body.setSize(10, 600);
        leftWall.setVisible(false);
        const rightWall = this.arenaWalls.create(1350, 300, null);
        rightWall.body.setSize(10, 600);
        rightWall.setVisible(false);
        this.physics.add.collider(this.player, this.arenaWalls);
    }

    _spawnEnemy(type, x, y) {
        const e = new Enemy(this, x, y, type);
        if (type !== 'flyeye') {
            this.physics.add.collider(e.sprite, this._floor);
            this.physics.add.collider(e.sprite, this.platforms);
        }
        this.enemies.push(e);
        return e;
    }

    _dropPotion(x, y) {
       
        if (Math.random() > 0.4) return;
    
        const potion = this.physics.add.sprite(x, y - 20, 'potion');
        potion.setScale(0.1).setDepth(10);
        potion.setBounce(0.4);
        potion.setCollideWorldBounds(true);
        potion.healAmount = Phaser.Math.Between(60,80);
    
        this.time.delayedCall(600, () => {
            if (!potion.active) return;
            this.tweens.add({
                targets: potion,
                y: potion.y - 6,
                duration: 700,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        });
    
        this.physics.add.collider(potion, this._floor);
        this.physics.add.collider(potion, this.platforms);
    
        this.physics.add.overlap(this.player, potion, () => {
            if (!potion.active) return;
            if (this.playerHealth >= this.playerMaxHealth) return;
    
            const actual = Math.min(potion.healAmount, this.playerMaxHealth - this.playerHealth);
            this.playerHealth = Math.min(this.playerMaxHealth, this.playerHealth + potion.healAmount);
            this._drawPlayerHpBar();
            this._playPotionEffect(potion.x, potion.y, actual);
            potion.destroy();
            this.potions = this.potions.filter(p => p !== potion);
        }, null, this);
    
        this.potions.push(potion);
    }
    
    _playPotionEffect(x, y, amount) {
        const particles = this.add.particles(x, y, 'particle', {
            speed:     { min: 40, max: 120 },
            angle:     { min: 0, max: 360 },
            scale:     { start: 1.2, end: 0 },
            blendMode: 'ADD',
            lifespan:  600,
            gravityY:  -80,
            quantity:  18,
            tint:      [0x44ff88, 0x00ff55, 0xffffff, 0xaaffcc],
            emitting:  false
        }).setDepth(12);
        particles.explode(18);
    
        const txt = this.add.text(x, y - 40, `+${amount}`, {
            fontSize: '22px', fill: '#44ff88',
            stroke: '#000000', strokeThickness: 4, fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(20);
        this.tweens.add({
            targets: txt,
            y: txt.y - 50,
            alpha: 0,
            duration: 1100,
            ease: 'Cubic.easeOut',
            onComplete: () => txt.destroy()
        });
    
        this.tweens.add({
            targets: this.playerHpGraphics,
            alpha: 0.3,
            duration: 100,
            yoyo: true,
            repeat: 3,
            ease: 'Sine.easeInOut',
            onComplete: () => { this.playerHpGraphics.alpha = 1; }
        });
    
        this.time.delayedCall(800, () => { if (particles.active) particles.destroy(); });
    }

    _playHealEffect() {
        const healParticles = this.add.particles(this.player.x, this.player.y - 20, 'particle', {
            speed:     { min: 20, max: 55 },
            angle:     { min: 240, max: 300 },
            scale:     { start: 0.8, end: 0 },
            blendMode: 'ADD',
            lifespan:  700,
            gravityY:  -60,
            quantity:  8,
            tint:      [0x44ff88, 0x88ffaa, 0x00ff55],
            emitting:  false
        }).setDepth(12);
        healParticles.explode(8);
    
        const healTxt = this.add.text(this.player.x, this.player.y - 50, '+10', {
            fontSize: '14px', fill: '#44ff88',
            stroke: '#000000', strokeThickness: 3, fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(12);
        this.tweens.add({
            targets: healTxt,
            y: healTxt.y - 28,
            alpha: 0,
            duration: 900,
            ease: 'Cubic.easeOut',
            onComplete: () => healTxt.destroy()
        });
    
        this.tweens.add({
            targets: this.playerHpGraphics,
            alpha: 0.4,
            duration: 120,
            yoyo: true,
            repeat: 1,
            ease: 'Sine.easeInOut',
            onComplete: () => { this.playerHpGraphics.alpha = 1; }
        });
    
        this.time.delayedCall(900, () => { if (healParticles.active) healParticles.destroy(); });
    }

    _drawDashCooldown(ratio) {
        this.dashCdGraphics.clear();
        const x = 590, y = 60, w = 160, h = 8;
        this.dashCdGraphics.fillStyle(0x112233, 1);
        this.dashCdGraphics.fillRect(x - 1, y - 1, w + 2, h + 2);
        const color = ratio >= 1 ? 0x44aaff : 0x336688;
        this.dashCdGraphics.fillStyle(color, 1);
        this.dashCdGraphics.fillRect(x, y, w * Math.min(ratio, 1), h);
        if (ratio > 0) {
            this.dashCdGraphics.fillStyle(0xaaddff, 0.4);
            this.dashCdGraphics.fillRect(x, y + 1, w * Math.min(ratio, 1), 2);
        }
        this.dashCdGraphics.lineStyle(1, 0x000000, 1);
        this.dashCdGraphics.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }

    _tryHitEnemies() {
        const inRange = [];
        this.enemies.forEach(e => {
            if (e.dead) return;
            const dist = Phaser.Math.Distance.Between(
                this.player.x, this.player.y, e.sprite.x, e.sprite.y
            );
            if (dist < 130) inRange.push({ e, dist });
        });

        inRange.sort((a, b) => a.dist - b.dist);
        const maxHit = Phaser.Math.Between(2, 4);
        const toHit  = inRange.slice(0, maxHit);

        toHit.forEach(({ e }) => {
            const playerDir = this.player.flipX ? -1 : 1;
            const dmg       = Phaser.Math.Between(19,25)
            const killed    = e.takeDamage(dmg, playerDir, true);
            this.cameras.main.shake(60, 0.004);

            if (killed) {
                if (e.type !== 'flyeye') {
                    this._landKillCount++;
                    if (this._landKillCount === 1 && !this._reinforceSent && this._remainLandPool.length > 0) {
                        this._reinforceSent = true;
                        this.time.delayedCall(1500, () => {
                            const pick = this._remainLandPool.splice(
                                Phaser.Math.Between(0, this._remainLandPool.length - 1), 1
                            )[0];
                            if (pick) this._spawnEnemy(pick.type, pick.x, pick.y);
                        });
                    }
                } else {
                    if (!this._flyReinforceSent && this._remainFlyPool.length > 0) {
                        this._flyReinforceSent = true;
                        this.time.delayedCall(1500, () => {
                            const pick = this._remainFlyPool.splice(0, 1)[0];
                            if (pick) this._spawnEnemy('flyeye', pick.x, pick.y);
                        });
                    }
                }

                this._checkVictory();
            }
        });
    }

    _enemyHitPlayer(damage) {
        if (this.playerInvincible || this.gamePaused) return;
        this.inCombat      = true;
        this.playerHealth  = Math.max(0, this.playerHealth - damage);
        this._drawPlayerHpBar();
        this.playerInvincible = true;
        this.player.setTintFill(0xff4444);
        this.time.delayedCall(150, () => { this.player.clearTint(); });
        this.cameras.main.shake(160, 0.01);
        if (this._combatTimer) {
            this._combatTimer.remove();
        }
        this._combatTimer = this.time.delayedCall(10000, () => {
            this.inCombat = false;
            this._combatTimer = null;
        });
        this.time.delayedCall(650, () => { this.playerInvincible = false; });
       
            if (this.playerHealth <= 0) {
            
                this.showDeathScreen()
             }
         }
         
         showDeathScreen() {
             if (this.isDeadScreenActive) return;
             this.isDeadScreenActive = true;
         
             this.gamePaused = true;
             this.physics.pause();
         
             if (this.player?.body) {
                 this.player.setVelocity(0, 0);
             }
         
             const cam = this.cameras.main;
             const cx = cam.width / 2;
             const cy = cam.height / 2;
         
             this.deathOverlay = this.add.rectangle(cx, cy, cam.width, cam.height, 0x000000, 0.55)
                 .setScrollFactor(0)
                 .setDepth(200);
         
             this.deathTitle = this.add.text(cx, cy - 70, 'YOU DIED', {
                 fontSize: '64px',
                 fill: '#d01818',
                 stroke: '#000000',
                 strokeThickness: 6,
                 fontStyle: 'bold',
                 fontFamily: 'serif'
             }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
         
             this.returnBtn = this.add.rectangle(cx, cy + 18, 320, 62, 0x1a1a1a, 0.9)
                 .setStrokeStyle(3, 0xffffff)
                 .setInteractive({ useHandCursor: true })
                 .setScrollFactor(0)
                 .setDepth(201);
         
             this.returnBtnText = this.add.text(cx, cy + 18, 'RETURN TO TITLE', {
                 fontSize: '24px',
                 fill: '#ffffff',
                 fontStyle: 'bold',
                 fontFamily: 'monospace'
             }).setOrigin(0.5).setScrollFactor(0).setDepth(202);
         
             this.deathHint = this.add.text(cx, cy + 78, 'Returning automatically in 10...', {
                 fontSize: '18px',
                 fill: '#dddddd',
                 stroke: '#000000',
                 strokeThickness: 3,
                 fontFamily: 'monospace'
             }).setOrigin(0.5).setScrollFactor(0).setDepth(202);
         
             this.returnBtn.on('pointerover', () => {
                 this.returnBtn.setFillStyle(0x2c2c2c, 1);
             });
         
             this.returnBtn.on('pointerout', () => {
                 this.returnBtn.setFillStyle(0x1a1a1a, 0.9);
             });
         
             this.returnBtn.on('pointerdown', () => {
                 this._returnToTitle();
             });
         
             let timeLeft = 10;
             this.deathCountdownEvent = this.time.addEvent({
                 delay: 1000,
                 repeat: 9,
                 callback: () => {
                     timeLeft--;
                     if (this.deathHint?.active) {
                         this.deathHint.setText(`Returning automatically in ${timeLeft}...`);
                     }
                 }
             });
         
             this.deathReturnTimer = this.time.delayedCall(10000, () => {
                 this._returnToTitle();
             });
         }
         _returnToTitle() {
             if (this._isReturningToTitle) return;
             this._isReturningToTitle = true;
         
             if (this.deathCountdownEvent) {
                 this.deathCountdownEvent.remove();
                 this.deathCountdownEvent = null;
             }
         
             if (this.deathReturnTimer) {
                 this.deathReturnTimer.remove();
                 this.deathReturnTimer = null;
             }
         
             this.cameras.main.fadeOut(350, 0, 0, 0);
         
             this.time.delayedCall(360, () => {
                 this.scene.start('TitleScene');
             });
         }

    _triggerFirstVictory() {
        this.firstVictory = true;
        this.cameras.main.shake(2000, 0.008);
        if (this.arenaWalls) {
            this.arenaWalls.clear(true, true);
            this.arenaWalls = null;
            this.arenaLocked = false;
        }
        this.time.delayedCall(600, () => {
            const sphereX = 980, sphereY = 135;
            const sphere = this.add.graphics();
            sphere.setPosition(sphereX, sphereY).setDepth(15);
            const drawGlowingSphere = (alpha) => {
                sphere.clear();
                sphere.fillStyle(0xffff88, 0.3 * alpha);
                sphere.fillCircle(0, 0, 35);
                sphere.fillStyle(0xffffaa, 0.6 * alpha);
                sphere.fillCircle(0, 0, 25);
                sphere.fillStyle(0xffffff, 1 * alpha);
                sphere.fillCircle(0, 0, 15);
            };
            drawGlowingSphere(1);
            this.tweens.add({
                targets: sphere, scaleX: 1.2, scaleY: 1.2,
                duration: 800, yoyo: true, repeat: 2, ease: 'Sine.easeInOut'
            });
            this.time.delayedCall(2400, () => {
                sphere.destroy();
                const scroll = this.physics.add.sprite(sphereX, sphereY, 'scroll');
                scroll.setScale(0.5).setDepth(15);
                this.tweens.add({
                    targets: scroll, y: sphereY - 10,
                    duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
                });
                this.physics.add.collider(scroll, this.platforms);
                this.physics.add.overlap(this.player, scroll, () => {
                    scroll.destroy();
                    this._showFireballSkillPopup();
                }, null, this);
            });
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ⚡ REWORKED: Strike of Judgement (Faster, Auto-release at Round 8)
    // ─────────────────────────────────────────────────────────────────────────
  
    _initJudgementVfx() {
        if (this.textures.exists('judgement_particle')) return;
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        
        // Particle
        g.fillStyle(0xffffff, 1);
        g.fillCircle(6, 6, 6);
        g.generateTexture('judgement_particle', 12, 12);
        g.clear();
        
        // Beam
        g.fillStyle(0xffffff, 1);
        g.fillRect(0, 0, 6, 24);
        g.generateTexture('judgement_beam', 6, 24);
        g.clear();
        
        // Ring for shockwave
        g.lineStyle(8, 0xffffff, 1);
        g.strokeCircle(32, 32, 28);
        g.generateTexture('judgement_ring', 64, 64);
        g.destroy();
    }
      
    _initJudgement() {
        this._initJudgementVfx();
      
        this.hasJudgement = true;
        this.judgementCooldown = 0;
        this.judgementCDMax = 50000;
        this.jActive = false;
        this.jObjects = [];
        this.jRoundsCompleted = 0;
        this.jHealBlocked = false;
      
        this.jCharging = false;
        this.jChargeTime = 0;
        this.jChargeDuration = 3500; // Reduced from 5000ms
        this.jChargeBarBg = null;
        this.jChargeBarFill = null;
        this.jChargeLabel = null;
      
        this._jMaxRounds = 8;
        this._jExecuteQueued = false;
        
        // ⚡ FASTER TIMING
        this._jFlashDuration = 220;      // Down from 340ms
        this._jFlashGap = 80;            // Down from 120ms
        this._jPreSequenceWait = 280;    // Down from 450ms
        this._jPostRoundWait = 320;      // Down from 450ms
    }
      
    clearJudgementChargeBar() {
        this.jCharging = false;
        this.jChargeTime = 0;
        if (this.jChargeBarBg) { this.jChargeBarBg.destroy(); this.jChargeBarBg = null; }
        if (this.jChargeBarFill) { this.jChargeBarFill.destroy(); this.jChargeBarFill = null; }
        if (this.jChargeLabel) { this.jChargeLabel.destroy(); this.jChargeLabel = null; }
    }
      
    _updateJudgement(delta) {
        if (!this.hasJudgement) return;
      
        if (this.judgementCooldown > 0) {
            this.judgementCooldown = Math.max(0, this.judgementCooldown - delta);
        }
      
        const rKey = this.keys.strike;
        const canCharge = !this.jActive && !this.gamePaused && this.judgementCooldown <= 0;
      
        this.judgementIconOverlay.clear();
        if (this.judgementCooldown > 0) {
            const ratio = this.judgementCooldown / this.judgementCDMax;
            const iconSize = 24 * 1.4;
            const iconX = this.judgementIcon.x - iconSize / 2;
            const iconY = this.judgementIcon.y - iconSize / 2;
            this.judgementIconOverlay.fillStyle(0x000000, 0.7);
            this.judgementIconOverlay.fillRect(iconX, iconY, iconSize, iconSize * ratio);
        }
      
        if (rKey.isDown && canCharge) {
            if (!this.jCharging) {
                this.jCharging = true;
                this.jChargeTime = 0;
                this.jChargeBarBg = this.add.graphics().setDepth(30);
                this.jChargeBarFill = this.add.graphics().setDepth(31);
                this.jChargeLabel = this.add.text(0, 0, 'CHANNELING...', {
                    fontSize: '11px', fill: '#fff7cc', stroke: '#000000', strokeThickness: 2, fontFamily: 'monospace'
                }).setOrigin(0.5, 1).setDepth(32);
            }
      
            this.jChargeTime = Math.min(this.jChargeTime + delta, this.jChargeDuration);
            const ratio = this.jChargeTime / this.jChargeDuration;
            const bx = this.player.x;
            const by = this.player.y - 90;
            const bw = 96, bh = 9;
      
            this.jChargeBarBg.clear();
            this.jChargeBarBg.fillStyle(0x000000, 0.65);
            this.jChargeBarBg.fillRect(bx - bw / 2 - 1, by - 1, bw + 2, bh + 2);
      
            this.jChargeBarFill.clear();
            const color = ratio >= 1 ? 0xffe066 : 0xfff2aa;
            this.jChargeBarFill.fillStyle(color, 1);
            this.jChargeBarFill.fillRect(bx - bw / 2, by, bw * ratio, bh);
            this.jChargeBarFill.fillStyle(0xffffff, 0.35);
            this.jChargeBarFill.fillRect(bx - bw / 2, by + 1, bw * ratio, 2);
            this.jChargeLabel.setPosition(bx, by - 2);
      
            if (this.jChargeTime >= this.jChargeDuration) {
                this.clearJudgementChargeBar();
                this.preJudgement();
            }
        } else if (this.jCharging) {
            this.clearJudgementChargeBar();
        }
    }
      
    preJudgement() {
        this.jActive = true;
        this.jRoundsCompleted = 0;
        this.jCurrentSeq = [];
        this.jCurrentRound = 0;
        this.jInputBuffer = [];
        this.jWaitingInput = false;
        this.jObjects = [];
        this.jHealBlocked = true;
        this.gamePaused = true;
        this._jExecuteQueued = false;
      
        this.player.setVelocityX(0);
        this.player.setVelocityY(0);
        this.cameras.main.centerOn(this.player.x, this.player.y);
      
        const W = this.cameras.main.width;
        const H = this.cameras.main.height;
        const canvas = this.textures.createCanvas('judgementdark', W, H);
        const ctx = canvas.getSourceImage().getContext('2d');
        this.jDarkCanvas = canvas;
      
        const startRadius = Math.sqrt(W * W + H * H) / 2 + 10;
        const endRadius = 50;
        const duration = 1300;
        let startTime = null;
        let currentRadius = startRadius;
      
        const darkImage = this.add.image(W / 2, H / 2, 'judgementdark')
            .setDepth(40)
            .setScrollFactor(0);
        this.jObjects.push(darkImage);
      
        const redraw = (time) => {
            if (!darkImage.active) return;
      
            const camX = this.player.x - this.cameras.main.scrollX;
            const camY = this.player.y - this.cameras.main.scrollY;
      
            if (startTime === null) startTime = time;
            const t = Math.min((time - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            currentRadius = startRadius + (endRadius - startRadius) * eased;
      
            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = 'rgba(5, 5, 20, 0.94)';
            ctx.fillRect(0, 0, W, H);
      
            const glowGradient = ctx.createRadialGradient(camX, camY, 0, camX, camY, currentRadius + 70);
            glowGradient.addColorStop(0, 'rgba(255, 235, 130, 0.22)');
            glowGradient.addColorStop(0.5, 'rgba(255, 210, 60, 0.08)');
            glowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = glowGradient;
            ctx.beginPath();
            ctx.arc(camX, camY, currentRadius + 70, 0, Math.PI * 2);
            ctx.fill();
      
            const holeGradient = ctx.createRadialGradient(camX, camY, Math.max(0, currentRadius - 30), camX, camY, currentRadius);
            holeGradient.addColorStop(0, 'rgba(0,0,0,1)');
            holeGradient.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = holeGradient;
            ctx.beginPath();
            ctx.arc(camX, camY, currentRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
      
            canvas.refresh();
        };
      
        this.jUpdateListener = (time) => redraw(time);
        this.events.on('update', this.jUpdateListener, this);
        this.time.delayedCall(duration + 150, () => this.startJudgementGame(), null, this);
    }
      
    startJudgementGame() {
        const PX = 400, PY = 300;
        const panel = this.add.graphics().setScrollFactor(0).setDepth(41);
        panel.fillStyle(0x0a0a1f, 0.97);
        panel.fillRoundedRect(PX - 235, PY - 215, 470, 440, 14);
        panel.lineStyle(2, 0xf0c040, 1);
        panel.strokeRoundedRect(PX - 235, PY - 215, 470, 440, 14);
        panel.lineStyle(1, 0xffe899, 0.3);
        panel.strokeRoundedRect(PX - 231, PY - 211, 462, 432, 12);
        this.jObjects.push(panel);
      
        const push = (o) => { this.jObjects.push(o); return o; };
      
        push(this.add.text(PX, PY - 180, 'STRIKE OF JUDGEMENT', {
            fontSize: '22px', fill: '#f5d060', stroke: '#1a0a00', strokeThickness: 4, fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(42));
      
        const divider = push(this.add.graphics().setScrollFactor(0).setDepth(42));
        divider.lineStyle(1, 0xf0c040, 0.5);
        divider.lineBetween(PX - 185, PY - 158, PX + 185, PY - 158);
      
        push(this.add.text(PX, PY - 140, 'Repeat the sequence. Reach 8 rounds for divine judgement.', {
            fontSize: '12px', fill: '#d4c080', stroke: '#000000', strokeThickness: 2, align: 'center', wordWrap: { width: 360 }
        }).setOrigin(0.5).setScrollFactor(0).setDepth(42));
      
        this.jDmgPreview = push(this.add.text(PX, PY - 110, 'Round 8: Execute nearby • 90% to all on screen', {
            fontSize: '14px', fill: '#ffffff', stroke: '#1a0a00', strokeThickness: 3, fontStyle: 'bold', align: 'center', wordWrap: { width: 360 }
        }).setOrigin(0.5).setScrollFactor(0).setDepth(42));
      
        this.jRoundTxt = push(this.add.text(PX, PY - 84, `Round 1 / ${this._jMaxRounds}`, {
            fontSize: '13px', fill: '#c8b870', stroke: '#000000', strokeThickness: 2
        }).setOrigin(0.5).setScrollFactor(0).setDepth(42));
      
        this.jStatusTxt = push(this.add.text(PX, PY - 58, '', {
            fontSize: '15px', fill: '#ffffff', stroke: '#000000', strokeThickness: 3
        }).setOrigin(0.5).setScrollFactor(0).setDepth(42));
      
        this._jProgressBg = push(this.add.graphics().setScrollFactor(0).setDepth(42));
        this._jProgressFill = push(this.add.graphics().setScrollFactor(0).setDepth(43));
      
        const DIRS = ['up', 'down', 'left', 'right'];
        const ARROWS = { up: '↑', down: '↓', left: '←', right: '→' };
        const BTNPOS = {
            up: { x: PX, y: PY + 8 },
            down: { x: PX, y: PY + 82 },
            left: { x: PX - 58, y: PY + 82 },
            right: { x: PX + 58, y: PY + 82 }
        };
        const SZ = 46;
        const CNORM = 0x12123a;
        const CACTIVE = 0xf0c040;
        const CCORRECT = 0x88ddaa;
        const CWRONG = 0xdd4444;
      
        this.jBtnGfx = {};
      
        const drawBtn = (dir, color, borderColor = 0x8a7830) => {
            const g = this.jBtnGfx[dir];
            const { x, y } = BTNPOS[dir];
            g.clear();
            g.fillStyle(color, 1);
            g.fillRoundedRect(x - SZ / 2, y - SZ / 2, SZ, SZ, 7);
            g.lineStyle(2, borderColor, 1);
            g.strokeRoundedRect(x - SZ / 2, y - SZ / 2, SZ, SZ, 7);
        };
      
        DIRS.forEach(dir => {
            const { x, y } = BTNPOS[dir];
            const g = push(this.add.graphics().setScrollFactor(0).setDepth(42));
            this.jBtnGfx[dir] = g;
            drawBtn(dir, CNORM);
            push(this.add.text(x, y, ARROWS[dir], {
                fontSize: '24px', fill: '#f5d060', stroke: '#000000', strokeThickness: 2
            }).setOrigin(0.5).setScrollFactor(0).setDepth(43));
        });
      
        const updateProgress = () => {
            const ratio = this.jRoundsCompleted / this._jMaxRounds;
            this._jProgressBg.clear();
            this._jProgressBg.fillStyle(0x000000, 0.55);
            this._jProgressBg.fillRect(PX - 150, PY + 145, 300, 14);
            this._jProgressFill.clear();
            this._jProgressFill.fillStyle(0xf0c040, 1);
            this._jProgressFill.fillRect(PX - 148, PY + 147, 296 * ratio, 10);
            this._jProgressFill.fillStyle(0xffffff, 0.35);
            this._jProgressFill.fillRect(PX - 148, PY + 148, 296 * ratio, 3);
        };
        updateProgress();
      
        // ⚡ USING FASTER TIMING
        const flash = (dir, color, ms = this._jFlashDuration) => new Promise(res => {
            drawBtn(dir, color, 0xffffff);
            this.time.delayedCall(ms, () => {
                if (this.jBtnGfx[dir]?.active) drawBtn(dir, CNORM);
                res();
            });
        });
      
        const wait = (ms) => new Promise(res => this.time.delayedCall(ms, res));
      
        const playSeq = async (seq) => {
            this.jWaitingInput = false;
            this.jStatusTxt.setText('Memorise...');
            await wait(this._jPreSequenceWait);
            for (const dir of seq) {
                await flash(dir, CACTIVE);
                await wait(this._jFlashGap);
            }
            this.jStatusTxt.setText('Repeat the sequence!');
            this.jInputBuffer = [];
            this.jWaitingInput = true;
        };
      
        const startRound = async () => {
            this.jCurrentRound++;
            this.jRoundTxt.setText(`Round ${this.jCurrentRound} / ${this._jMaxRounds}`);
            const pool = ['up', 'down', 'left', 'right'];
            this.jCurrentSeq.push(pool[Math.floor(Math.random() * 4)]);
            await playSeq(this.jCurrentSeq);
        };
      
        this.jOnInputComplete = async (correct) => {
            this.jWaitingInput = false;
            if (this._jExecuteQueued) return;
      
            if (correct) {
                this.jRoundsCompleted++;
                updateProgress();
                
                // ⚡ AUTO-RELEASE AT ROUND 8
                if (this.jRoundsCompleted >= this._jMaxRounds) {
                    this.jStatusTxt.setText('Divine charge complete!');
                    for (const dir of this.jCurrentSeq) {
                        await flash(dir, CCORRECT, 140);
                    }
                    this._jExecuteQueued = true;
                    await wait(450);
                    this.executeDivineJudgement(); // ⚡ NEW FUNCTION
                    return;
                }
                
                this.jStatusTxt.setText('Correct!');
                for (const dir of this.jCurrentSeq) {
                    await flash(dir, CCORRECT, 140);
                }
                await wait(this._jPostRoundWait);
                startRound();
            } else {
                this._jExecuteQueued = true;
                this.jStatusTxt.setText('Sequence broken! Releasing partial judgement...');
                for (const dir of this.jInputBuffer) {
                    await flash(dir, CWRONG, 150);
                }
                await wait(550);
                this.executeJudgement(0.55, false);
            }
        };
      
        this.jKeyHandler = (e) => {
            if (!this.jWaitingInput) return;
            const map = {
                ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
                w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right'
            };
            const dir = map[e.key];
            if (dir) this.jReceiveInput(dir);
        };
      
        window.addEventListener('keydown', this.jKeyHandler);
      
        this.jReceiveInput = (dir) => {
            if (!this.jWaitingInput || this._jExecuteQueued) return;
      
            const expected = this.jCurrentSeq[this.jInputBuffer.length];
            this.jInputBuffer.push(dir);
      
            const g = this.jBtnGfx[dir];
            const { x, y } = BTNPOS[dir];
            g.clear();
            g.fillStyle(dir === expected ? CCORRECT : CWRONG, 1);
            g.fillRoundedRect(x - SZ / 2, y - SZ / 2, SZ, SZ, 7);
            g.lineStyle(2, 0xffffff, 1);
            g.strokeRoundedRect(x - SZ / 2, y - SZ / 2, SZ, SZ, 7);
            this.time.delayedCall(180, () => {
                if (!g.active) return;
                drawBtn(dir, CNORM);
            });
      
            if (dir !== expected) {
                this.jOnInputComplete(false);
            } else if (this.jInputBuffer.length >= this.jCurrentSeq.length) {
                this.jOnInputComplete(true);
            }
        };
      
        startRound();
    }
      
    _isJudgementSpecialTarget(target) {
        return target.kind === 'boss' || target.kind === 'alternateEgo' || target.kind === 'special';
    }
      
    _collectJudgementTargets() {
        const targets = [];
      
        if (Array.isArray(this.enemies)) {
            this.enemies.forEach(e => {
                if (!e || e.dead || !e.sprite?.active) return;
                targets.push({
                    ref: e,
                    sprite: e.sprite,
                    hp: e.hp,
                    maxHp: e.maxHp,
                    kind: 'normal',
                    source: 'enemies'
                });
            });
        }
      
        const guessedSpecialRefs = [
            ['boss', 'boss'],
            ['alternate_ego', 'alternateEgo']
        ];
      
        guessedSpecialRefs.forEach(([prop, kind]) => {
            const ent = this[prop];
            if (!ent) return;
            const sprite = ent.sprite || ent;
            if (!sprite?.active) return;
            targets.push({
                ref: ent,
                sprite,
                hp: ent.hp ?? ent.health ?? ent.currentHp ?? ent.maxHp ?? ent.maxHealth ?? 0,
                maxHp: ent.maxHp ?? ent.maxHealth ?? ent.hp ?? ent.health ?? 0,
                kind,
                source: prop
            });
        });
      
        const seen = new Set();
        return targets.filter(t => {
            if (!t.sprite || seen.has(t.sprite)) return false;
            seen.add(t.sprite);
            return true;
        });
    }
      
    _applyJudgementDamage(target, dmg, kbDir = 0) {
        const ref = target.ref;
      
        if (ref && typeof ref.takeDamage === 'function') {
            ref.takeDamage(dmg, kbDir, false);
            return;
        }
      
        if (typeof ref?.hp === 'number') ref.hp = Math.max(0, ref.hp - dmg);
        else if (typeof ref?.health === 'number') ref.health = Math.max(0, ref.health - dmg);
        else if (typeof ref?.currentHp === 'number') ref.currentHp = Math.max(0, ref.currentHp - dmg);
      
        if (typeof ref?._drawHpBar === 'function') ref._drawHpBar();
        if (typeof ref?.drawHpBar === 'function') ref.drawHpBar();
    }
      
    _killJudgementTarget(target, kbDir = 0) {
        const ref = target.ref;
      
        if (ref && typeof ref.takeDamage === 'function') {
            const lethal = Math.max((target.hp || 0) + 9999, (target.maxHp || 0) + 9999, 99999);
            ref.takeDamage(lethal, kbDir, false);
            return;
        }
      
        if (typeof ref?.hp === 'number') ref.hp = 0;
        if (typeof ref?.health === 'number') ref.health = 0;
        if (typeof ref?.currentHp === 'number') ref.currentHp = 0;
      
        if (typeof ref?._die === 'function') ref._die();
        if (typeof ref?.die === 'function') ref.die();
        if (typeof ref?._drawHpBar === 'function') ref._drawHpBar();
    }
      
    _spawnJudgementHitFx(sprite, label, isMassive = false) {
        const burst = this.add.particles(sprite.x, sprite.y - 10, 'judgement_particle', {
            speed: { min: 120, max: 260 },
            angle: { min: 250, max: 290 },
            scale: { start: isMassive ? 1.8 : 1.0, end: 0 },
            blendMode: 'ADD',
            lifespan: 600,
            gravityY: -40,
            quantity: isMassive ? 24 : 12,
            tint: [0xf0c040, 0xffffff, 0xfff2cc],
            emitting: false
        }).setDepth(16);
        burst.explode(isMassive ? 24 : 12);
      
        const beam = this.add.image(sprite.x, sprite.y - 40, 'judgement_beam')
            .setTint(0xffefb0)
            .setAlpha(0.95)
            .setDepth(15)
            .setScale(isMassive ? 2.8 : 2.0, isMassive ? 9 : 6);
      
        this.tweens.add({
            targets: beam,
            alpha: 0,
            scaleY: beam.scaleY * 1.3,
            duration: 260,
            ease: 'Cubic.easeOut',
            onComplete: () => beam.destroy()
        });
      
        sprite.setTintFill(0xfff0a0);
        this.time.delayedCall(180, () => { if (sprite.active) sprite.clearTint(); });
      
        const txt = this.add.text(sprite.x, sprite.y - 72, label, {
            fontSize: isMassive ? '26px' : '20px',
            fill: '#f5d060',
            stroke: '#1a0a00',
            strokeThickness: 5,
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(20);
      
        this.tweens.add({
            targets: txt,
            y: txt.y - 60,
            alpha: 0,
            duration: 1200,
            ease: 'Cubic.easeOut',
            onComplete: () => txt.destroy()
        });
      
        this.time.delayedCall(700, () => { if (burst.active) burst.destroy(); });
    }

    // ⚡ NEW: Divine Judgement (Round 8 completion)
    executeDivineJudgement() {
        if (!this.jActive) return;
      
        this.jActive = false;
        this.jHealBlocked = false;
        this.jWaitingInput = false;
        this.clearJudgementChargeBar();
      
        if (this.jKeyHandler) {
            window.removeEventListener('keydown', this.jKeyHandler);
            this.jKeyHandler = null;
        }
      
        this.jObjects.forEach(o => { if (o?.active) o.destroy(); });
        this.jObjects = [];
      
        this.events.off('update', this.jUpdateListener, this);
        if (this.jDarkCanvas) {
            this.textures.remove('judgementdark');
            this.jDarkCanvas = null;
        }
      
        this.gamePaused = false;
        this.judgementCooldown = this.judgementCDMax;
      
        const targets = this._collectJudgementTargets();
        const executeRadius = 240; // Execution range for nearby enemies
      
        // ⚡ ENHANCED VFX
        // Screen flash
        this.cameras.main.flash(650, 255, 245, 200, false);
        this.cameras.main.shake(1200, 0.032);
      
        // Multi-layer shockwaves
        const createShockwave = (delay, maxRadius, duration, color, alpha) => {
            this.time.delayedCall(delay, () => {
                const shockGfx = this.add.graphics().setDepth(15);
                shockGfx.setPosition(this.player.x, this.player.y);
                this.tweens.addCounter({
                    from: 0,
                    to: maxRadius,
                    duration: duration,
                    ease: 'Cubic.easeOut',
                    onUpdate: t => {
                        const r = t.getValue();
                        shockGfx.clear();
                        shockGfx.lineStyle(10, color, alpha * (1 - r / maxRadius));
                        shockGfx.strokeCircle(0, 0, r);
                        shockGfx.lineStyle(4, 0xffffff, alpha * 0.7 * (1 - r / maxRadius));
                        shockGfx.strokeCircle(0, 0, r * 0.8);
                    },
                    onComplete: () => shockGfx.destroy()
                });
            });
        };
      
        createShockwave(0, 1200, 1000, 0xf0c040, 1.0);
        createShockwave(180, 1000, 800, 0xffe899, 0.7);
        createShockwave(320, 800, 600, 0xffffff, 0.5);
      
        // Massive particle burst from player
        const mainBurst = this.add.particles(this.player.x, this.player.y - 20, 'judgement_particle', {
            speed: { min: 280, max: 620 },
            angle: { min: 0, max: 360 },
            scale: { start: 3.0, end: 0 },
            blendMode: 'ADD',
            lifespan: 800,
            gravityY: 120,
            quantity: 120,
            tint: [0xf0c040, 0xffffff, 0xffe899, 0xfff2cc],
            emitting: false
        }).setDepth(16);
        mainBurst.explode(120);
      
        // Ring explosions
        for (let i = 0; i < 8; i++) {
            this.time.delayedCall(i * 80, () => {
                const angle = (Math.PI * 2 * i) / 8;
                const dist = 180 + Math.random() * 60;
                const rx = this.player.x + Math.cos(angle) * dist;
                const ry = this.player.y + Math.sin(angle) * dist;
                
                const ringBurst = this.add.particles(rx, ry, 'judgement_particle', {
                    speed: { min: 100, max: 200 },
                    angle: { min: 0, max: 360 },
                    scale: { start: 1.5, end: 0 },
                    blendMode: 'ADD',
                    lifespan: 500,
                    tint: [0xf0c040, 0xffffff],
                    quantity: 15,
                    emitting: false
                }).setDepth(16);
                ringBurst.explode(15);
                this.time.delayedCall(600, () => { if (ringBurst.active) ringBurst.destroy(); });
            });
        }
      
        this.time.delayedCall(1100, () => { if (mainBurst.active) mainBurst.destroy(); });
      
        // ⚡ DAMAGE APPLICATION (Delayed for dramatic effect)
        this.time.delayedCall(220, () => {
            targets.forEach(target => {
                if (!target.sprite?.active) return;
      
                const kbDir = target.sprite.x >= this.player.x ? 1 : -1;
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, target.sprite.x, target.sprite.y);
                const isSpecial = this._isJudgementSpecialTarget(target);
      
                // Skip bosses entirely
                if (target.kind === 'boss') return;
      
                // Special enemies (alternate ego) take reduced damage
                if (target.kind === 'alternateEgo' || target.kind === 'special') {
                    const maxHp = Math.max(1, target.maxHp || target.hp || 1);
                    const dmg = Math.max(1, Math.floor(maxHp * 0.40)); // 40% damage to special
                    this._applyJudgementDamage(target, dmg, kbDir);
                    this._spawnJudgementHitFx(target.sprite, '40%', true);
                    return;
                }
      
                // ⚡ EXECUTE NEARBY ENEMIES
                if (dist <= executeRadius) {
                    this._killJudgementTarget(target, kbDir);
                    this._spawnJudgementHitFx(target.sprite, 'EXECUTED', true);
                    return;
                }
      
                // ⚡ 90% DAMAGE TO ALL OTHER ENEMIES ON SCREEN
                const maxHp = Math.max(1, target.maxHp || target.hp || 1);
                const dmg = Math.max(1, Math.floor(maxHp * 0.90));
                this._applyJudgementDamage(target, dmg, kbDir);
                this._spawnJudgementHitFx(target.sprite, 'JUDGED', true);
            });
      
            // Title label
            const label = this.add.text(this.player.x, this.player.y - 96,
                'DIVINE JUDGEMENT',
                {
                    fontSize: '38px',
                    fill: '#f5d060',
                    stroke: '#1a0a00',
                    strokeThickness: 6,
                    fontStyle: 'bold'
                }
            ).setOrigin(0.5).setDepth(20);
      
            this.tweens.add({
                targets: label,
                y: label.y - 80,
                alpha: 0,
                duration: 1500,
                ease: 'Cubic.easeOut',
                onComplete: () => label.destroy()
            });
      
            if (this.checkVictory) this.checkVictory();
            if (this._checkVictory) this._checkVictory();
        });
    }
      
    // Partial judgement (failed sequence)
    executeJudgement(powerMult = 1.0, isMax = false) {
        if (!this.jActive) return;
      
        this.jActive = false;
        this.jHealBlocked = false;
        this.jWaitingInput = false;
        this.clearJudgementChargeBar();
      
        if (this.jKeyHandler) {
            window.removeEventListener('keydown', this.jKeyHandler);
            this.jKeyHandler = null;
        }
      
        this.jObjects.forEach(o => { if (o?.active) o.destroy(); });
        this.jObjects = [];
      
        this.events.off('update', this.jUpdateListener, this);
        if (this.jDarkCanvas) {
            this.textures.remove('judgementdark');
            this.jDarkCanvas = null;
        }
      
        this.gamePaused = false;
        this.judgementCooldown = this.judgementCDMax;
      
        const rounds = Math.max(1, this.jRoundsCompleted);
        const targets = this._collectJudgementTargets();
        const executeRadius = 220;
      
        this.cameras.main.flash(350, 255, 245, 200, false);
        this.cameras.main.shake(600, 0.018);
      
        const shockGfx = this.add.graphics().setDepth(15);
        shockGfx.setPosition(this.player.x, this.player.y);
        this.tweens.addCounter({
            from: 0,
            to: 420,
            duration: 420,
            ease: 'Cubic.easeOut',
            onUpdate: t => {
                const r = t.getValue();
                const maxR = 420;
                shockGfx.clear();
                shockGfx.lineStyle(5, 0xf0c040, 1 - (r / maxR));
                shockGfx.strokeCircle(0, 0, r);
                shockGfx.lineStyle(2, 0xffffff, 0.55 * (1 - (r / maxR)));
                shockGfx.strokeCircle(0, 0, r * 0.7);
            },
            onComplete: () => shockGfx.destroy()
        });
      
        const burst = this.add.particles(this.player.x, this.player.y - 20, 'judgement_particle', {
            speed: { min: 180, max: 420 },
            angle: { min: 0, max: 360 },
            scale: { start: 1.8, end: 0 },
            blendMode: 'ADD',
            lifespan: 650,
            gravityY: 100,
            quantity: 50,
            tint: [0xf0c040, 0xffffff, 0xffe899, 0xfff2cc],
            emitting: false
        }).setDepth(16);
        burst.explode(50);
        this.time.delayedCall(1000, () => { if (burst.active) burst.destroy(); });
      
        this.time.delayedCall(120, () => {
            targets.forEach(target => {
                if (!target.sprite?.active) return;
      
                const kbDir = target.sprite.x >= this.player.x ? 1 : -1;
                const maxHp = Math.max(1, target.maxHp || target.hp || 1);
                const isSpecial = this._isJudgementSpecialTarget(target);
      
                if (target.kind === 'boss') return;
      
                if (target.kind === 'alternateEgo' || target.kind === 'special') {
                    const dmg = Math.max(1, Math.floor(maxHp * 0.16 * rounds * powerMult));
                    this._applyJudgementDamage(target, dmg, kbDir);
                    this._spawnJudgementHitFx(target.sprite, `${dmg}`, false);
                    return;
                }
      
                const dmg = Math.max(1, Math.floor(maxHp * Math.min(0.18 + rounds * 0.07, 0.62) * powerMult));
                this._applyJudgementDamage(target, dmg, kbDir);
                this._spawnJudgementHitFx(target.sprite, `${dmg}`, false);
            });
      
            const label = this.add.text(this.player.x, this.player.y - 86,
                `STRIKE OF JUDGEMENT  ·  ROUND ${rounds}`,
                {
                    fontSize: '26px',
                    fill: '#f5d060',
                    stroke: '#1a0a00',
                    strokeThickness: 5,
                    fontStyle: 'bold'
                }
            ).setOrigin(0.5).setDepth(20);
      
            this.tweens.add({
                targets: label,
                y: label.y - 70,
                alpha: 0,
                duration: 1350,
                ease: 'Cubic.easeOut',
                onComplete: () => label.destroy()
            });
      
            if (this.checkVictory) this.checkVictory();
            if (this._checkVictory) this._checkVictory();
        });
    }

    _showFireballSkillPopup() {
        this.gamePaused = true;
        this.player.setVelocityX(0);
        this.player.setVelocityY(0);
        const overlay = this.add.graphics().setScrollFactor(0).setDepth(50);
        overlay.fillStyle(0x000000, 0.85);
        overlay.fillRect(0, 0, 800, 600);
        const panelW = 500, panelH = 530;
        const panelX = 400, panelY = 300;
        const panel = this.add.graphics().setScrollFactor(0).setDepth(51);
        panel.fillStyle(0x1a1a2e, 1);
        panel.fillRoundedRect(panelX - panelW/2, panelY - panelH/2, panelW, panelH, 15);
        panel.lineStyle(3, 0xffa500, 1);
        panel.strokeRoundedRect(panelX - panelW/2, panelY - panelH/2, panelW, panelH, 15);
        const title = this.add.text(panelX, panelY - 170, 'SKILL ACQUIRED', {
            fontSize: '32px', fill: '#ffa500',
            stroke: '#000000', strokeThickness: 4, fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(52);
        const skillName = this.add.text(panelX, panelY - 120, 'FIREBALL', {
            fontSize: '40px', fill: '#ff4500',
            stroke: '#000000', strokeThickness: 5, fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(52);
        
        const icon = this.add.image(panelX,panelY-60,'skills', 44).setDepth(50);
        icon.setScale(3).setScrollFactor(0).setDepth(52);
        const specs = [
            'Press F to launch a fireball',
            '',
            ' Damage: 20-35 to 1-2 enemies',
            ' Inflicts BURN status (5s)',
            ' Burn: 8 DMG/sec',
            ' Melee deals 1.5x damage to burning enemies',
            ' Burning enemies move 30% faster',
            '',
            'Cooldown: 2 seconds'
        ];
        const specsText = this.add.text(panelX, panelY + 80, specs.join('\n'), {
            fontSize: '16px', fill: '#ffffff',
            stroke: '#000000', strokeThickness: 2,
            align: 'center', lineSpacing: 4
        }).setOrigin(0.5).setScrollFactor(0).setDepth(52);
        const buttonW = 180, buttonH = 50, buttonY = panelY + 220;
        const button = this.add.graphics().setScrollFactor(0).setDepth(52);
        button.fillStyle(0x00ff00, 1);
        button.fillRoundedRect(panelX - buttonW/2, buttonY - buttonH/2, buttonW, buttonH, 8);
        button.lineStyle(3, 0x00aa00, 1);
        button.strokeRoundedRect(panelX - buttonW/2, buttonY - buttonH/2, buttonW, buttonH, 8);
        const buttonText = this.add.text(panelX, buttonY, 'LEARN', {
            fontSize: '28px', fill: '#ffffff',
            stroke: '#000000', strokeThickness: 4, fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(53);
        const buttonZone = this.add.zone(panelX, buttonY, buttonW, buttonH)
            .setScrollFactor(0).setDepth(53).setInteractive({ useHandCursor: true });
        
        buttonZone.on('pointerover', () => {
            button.clear();
            button.fillStyle(0x00dd00, 1);
            button.fillRoundedRect(panelX - buttonW/2, buttonY - buttonH/2, buttonW, buttonH, 8);
            button.lineStyle(3, 0x00aa00, 1);
            button.strokeRoundedRect(panelX - buttonW/2, buttonY - buttonH/2, buttonW, buttonH, 8);
        });
        buttonZone.on('pointerout', () => {
            button.clear();
            button.fillStyle(0x00ff00, 1);
            button.fillRoundedRect(panelX - buttonW/2, buttonY - buttonH/2, buttonW, buttonH, 8);
            button.lineStyle(3, 0x00aa00, 1);
            button.strokeRoundedRect(panelX - buttonW/2, buttonY - buttonH/2, buttonW, buttonH, 8);
        });
        buttonZone.on('pointerdown', () => {
            this.hasFireball = true;
            this.fireballIcon.setVisible(true);
            this.fireballAcquiredTime = this.time.now;
            overlay.destroy();
            panel.destroy();
            title.destroy();
            skillName.destroy();
            icon.destroy();
            specsText.destroy();
            button.destroy();
            buttonText.destroy();
            buttonZone.destroy();
            this.gamePaused = false;
            const tutorial = this.add.text(400, 150, 'Press F to launch Fireball!', {
                fontSize: '26px', fill: '#ff4500',
                stroke: '#000000', strokeThickness: 4
            }).setOrigin(0.5).setScrollFactor(0).setDepth(25);
            this.tweens.add({
                targets: tutorial, alpha: 0,
                duration: 600, delay: 3000,
                onComplete: () => tutorial.destroy()
            });
        });
    }

    
    _createSecondArea() {
        if (this.secondAreaTriggered) return;
        this.secondAreaTriggered = true;
        this.wave2Enemies = [];
    
        if (this.arrowPrompt) {
            this.arrowPrompt.destroy();
            this.arrowPrompt = null;
        }
    
        const p1 = this.platforms.create(1800, 380, 'plat1');
        p1.body.setSize(200, 50); p1.refreshBody();
    
        const p2 = this.platforms.create(2525, 400, 'plat2');
        p2.body.setSize(200, 50); p2.refreshBody();
    
        const p3 = this.platforms.create(2300, 200, 'plat1');
        p3.body.setSize(200, 50); p3.refreshBody();
    
        const p4 = this.platforms.create(2100, 150, 'plat1');
        p4.body.setSize(200, 50); p4.refreshBody();
    
        const p6 = this.platforms.create(2175, 150, 'plat1');
        p6.body.setSize(200, 50); p6.refreshBody();
    
        const p5 = this.platforms.create(2000, 300, 'plat3');
        p5.body.setSize(p5.width, 50); p5.refreshBody();
    
        const p8 = this.platforms.create(2400, 320, 'plat1');
        p8.body.setSize(p5.width, 50); p8.refreshBody();
    
        const flyPositions = [
            { x: 1850, y: 350 },
            { x: 2050, y: 250 },
            { x: 2250, y: 170 },
            { x: 1950, y: 120 },
            { x: 2290, y: 290 },
            { x: 2150, y: 280 }
        ];
        flyPositions.forEach(pos => {
            this.wave2Enemies.push(this._spawnEnemy('flyeye', pos.x, pos.y));
        });
    
        const landPositions = [
            { type: 'goblin',   x: 1750, y: FLOOR_Y - 60 },
            { type: 'skeleton', x: 1950, y: FLOOR_Y - 60 },
            { type: 'goblin',   x: 1850, y: FLOOR_Y - 60 },
            { type: 'skeleton', x: 2350, y: FLOOR_Y - 60 },
            { type: 'goblin',   x: 2200, y: FLOOR_Y - 60 },
            { type: 'skeleton', x: 2150, y: FLOOR_Y - 60 }
        ];
    
        landPositions.forEach(pos => {
            const e = new Enemy(this, pos.x, pos.y, pos.type);
            this.physics.add.collider(e.sprite, this._floor);
            this.physics.add.collider(e.sprite, this.platforms);
            this.enemies.push(e);
            this.wave2Enemies.push(e);
        });
    }

    
    _triggerSecondVictory() {
        this.cameras.main.shake(2000, 0.008);

        this.time.delayedCall(600, () => {
            const sphereX = 2150, sphereY = 100;
            const sphere = this.add.graphics();
            sphere.setPosition(sphereX, sphereY).setDepth(15);
            const drawGlowingSphere = (alpha) => {
                sphere.clear();
                sphere.fillStyle(0xffff88, 0.3 * alpha);
                sphere.fillCircle(0, 0, 35);
                sphere.fillStyle(0xffffaa, 0.6 * alpha);
                sphere.fillCircle(0, 0, 25);
                sphere.fillStyle(0xffffff, 1 * alpha);
                sphere.fillCircle(0, 0, 15);
            };
            drawGlowingSphere(1);
            this.tweens.add({
                targets: sphere, scaleX: 1.2, scaleY: 1.2,
                duration: 800, yoyo: true, repeat: 2, ease: 'Sine.easeInOut'
            });
            
            this.time.delayedCall(2400, () => {
                sphere.destroy();
                const scroll = this.physics.add.sprite(sphereX, sphereY, 'scroll');
                scroll.setScale(0.5).setDepth(15);
                this.tweens.add({
                    targets: scroll, y: sphereY - 10,
                    duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
                });
                this.physics.add.collider(scroll,this.platforms)

                this.physics.add.overlap(this.player, scroll, () => {
                    scroll.destroy();
                    this._showSecondSkillPopup();
                }, null, this);
            });
        });
    }

    _showSecondSkillPopup() {
        this.gamePaused = true;
        this.player.setVelocityX(0);
        this.player.setVelocityY(0);
    
        const overlay = this.add.graphics().setScrollFactor(0).setDepth(50);
        overlay.fillStyle(0x05051a, 0.90);
        overlay.fillRect(0, 0, 800, 600);
    
        const panelW = 500, panelH = 530;
        const panelX = 400, panelY = 300;
    
        const panel = this.add.graphics().setScrollFactor(0).setDepth(51);
        panel.fillStyle(0x0a0a1f, 0.97);
        panel.fillRoundedRect(panelX - panelW/2, panelY - panelH/2, panelW, panelH, 15);
        panel.lineStyle(3, 0xf0c040, 1);
        panel.strokeRoundedRect(panelX - panelW/2, panelY - panelH/2, panelW, panelH, 15);
        panel.lineStyle(1, 0xffe899, 0.3);
        panel.strokeRoundedRect(panelX - panelW/2 + 4, panelY - panelH/2 + 4, panelW - 8, panelH - 8, 12);
    
        const title = this.add.text(panelX, panelY - 170, 'SKILL ACQUIRED', {
            fontSize: '32px', fill: '#f0c040',
            stroke: '#1a0a00', strokeThickness: 4, fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(52);
    
        const divider = this.add.graphics().setScrollFactor(0).setDepth(52);
        divider.lineStyle(1, 0xf0c040, 0.45);
        divider.lineBetween(panelX - 190, panelY - 148, panelX + 190, panelY - 148);
    
        const skillName = this.add.text(panelX, panelY - 120, 'STRIKE OF JUDGEMENT', {
            fontSize: '40px', fill: '#ffffff',
            stroke: '#5a3a00', strokeThickness: 5, fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(52);
    
        const icon = this.add.image(panelX, panelY - 60, 'skills', 27)
            .setScale(3).setScrollFactor(0).setDepth(52);
    
        const specs = [
            'Hold W to channel Strike of Judgement',
            '',
            'Complete 8 sequence rounds for full power',
            'Use the power of justice to strike your enemies',
            'Failed sequence: partial judgement',
            '',
            '',
            '',
            'Cooldown: 40 seconds'
        ];
    
        const specsText = this.add.text(panelX, panelY + 80, specs.join('\n'), {
            fontSize: '16px', fill: '#d4c080',
            stroke: '#000000', strokeThickness: 2,
            align: 'center', lineSpacing: 4
        }).setOrigin(0.5).setScrollFactor(0).setDepth(52);
    
        const buttonW = 180, buttonH = 50, buttonY = panelY + 220;
    
        const button = this.add.graphics().setScrollFactor(0).setDepth(52);
    
        const _drawBtn = (hover) => {
            button.clear();
            button.fillStyle(hover ? 0xf0c040 : 0xb8902a, 1);
            button.fillRoundedRect(panelX - buttonW/2, buttonY - buttonH/2, buttonW, buttonH, 8);
            button.lineStyle(2, hover ? 0xffffff : 0xf0d070, 1);
            button.strokeRoundedRect(panelX - buttonW/2, buttonY - buttonH/2, buttonW, buttonH, 8);
        };
        _drawBtn(false);
    
        const buttonText = this.add.text(panelX, buttonY, 'BESTOW', {
            fontSize: '28px', fill: '#ffffff',
            stroke: '#5a3a00', strokeThickness: 4, fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(53);
    
        const buttonZone = this.add.zone(panelX, buttonY, buttonW, buttonH)
            .setScrollFactor(0).setDepth(53).setInteractive({ useHandCursor: true });
    
        buttonZone.on('pointerover',  () => _drawBtn(true));
        buttonZone.on('pointerout',   () => _drawBtn(false));
        buttonZone.on('pointerdown',  () => {
            this.hasSecondSkill = true;
            this.judgementIcon.setVisible(true);
    
            this.cameras.main.flash(400, 255, 220, 100, false);
    
            overlay.destroy();
            panel.destroy();
            divider.destroy();
            title.destroy();
            skillName.destroy();
            icon.destroy();
            specsText.destroy();
            button.destroy();
            buttonText.destroy();
            buttonZone.destroy();
            this.gamePaused = false;
    
            this.time.delayedCall(5000, () => {
                this._showFinalVictory();
            });
        });
    }

    _showFinalVictory() {
        this.physics.pause();
        this.player.anims.play('idle', true);
        const overlay = this.add.graphics().setScrollFactor(0).setDepth(10);
        overlay.fillStyle(0x000000, 0.45);
        overlay.fillRect(0, 0, 800, 600);
        const victoryText = this.add.text(400, 230, 'Congratulations!', {
            fontSize: '52px', fill: '#ffe066',
            stroke: '#000000', strokeThickness: 6,
            fontStyle: 'bold', align: 'center'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(11);
        const subText = this.add.text(400, 300, 'You passed the tutorial!', {
            fontSize: '28px', fill: '#ffffff',
            stroke: '#000000', strokeThickness: 4, align: 'center'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(11);
        const continueText = this.add.text(400, 360, 'Loading next area...', {
            fontSize: '20px', fill: '#aaffaa',
            stroke: '#000000', strokeThickness: 3, align: 'center'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(11);
        this.tweens.add({
            targets: victoryText,
            scaleX: 1.08, scaleY: 1.08,
            duration: 500, yoyo: true, repeat: -1,
            ease: 'Sine.easeInOut'
        });
        this.time.delayedCall(2000, () => {
            this.cameras.main.fadeOut(800, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('Cutscene1');
            });
        });
    }


    _launchFireball() {
        if (!this.hasFireball || this.fireballCooldown > 0 || this.gamePaused) return;
        this.fireballCooldown = this.fireballCooldownMax;
    
        const dir   = this.player.flipX ? -1 : 1;
        const fb    = this.physics.add.sprite(this.player.x + dir * 30, this.player.y - 10, 'flame');
        fb.setScale(0.6).setDepth(10);
        fb.body.setAllowGravity(false);
        fb.setVelocityX(dir * 520);
    
        this.fireballs.push(fb);
    
        this.tweens.add({
            targets: fb, angle: dir > 0 ? 360 : -360,
            duration: 600, repeat: -1
        });
    
        const DIRECT_DMG_MIN  = 20;
        const DIRECT_DMG_MAX  = 35;
        const SPLASH_RADIUS   = 120;
        const SPLASH_MIN_DIST = 40;
        const SPLASH_DMG_PCT  = 0.55;
        const BURN_DURATION   = 5000;
        const BURN_DMG        = 8;
    
        let hit = false;
    
        const checkHit = this.time.addEvent({
            delay: 16,
            loop: true,
            callback: () => {
                if (!fb.active) { checkHit.remove(); return; }
    
                this.enemies.forEach(e => {
                    if (e.dead) return;
                    const dist = Phaser.Math.Distance.Between(fb.x, fb.y, e.sprite.x, e.sprite.y);
    
                    if (dist < 45 && !hit) {
                        hit = true;
                        const dmg = Phaser.Math.Between(DIRECT_DMG_MIN, DIRECT_DMG_MAX);
                        const killed = e.takeDamage(dmg, dir, false);
                        e.applyBurn(BURN_DMG, BURN_DURATION);
                        _explode(this, fb.x, fb.y);
                        _doSplash(this, fb.x, fb.y, e);
                        if (killed) this._checkVictory();
                        fb.destroy();
                        checkHit.remove();
                    }
                });
    
                if (fb.active && (fb.x < 0 || fb.x > 3600 || fb.body.blocked.down)) {
                    _explode(this, fb.x, fb.y);
                    _doSplash(this, fb.x, fb.y, null);
                    fb.destroy();
                    checkHit.remove();
                }
            }
        });
    
        const _explode = (scene, ex, ey) => {
            const emitter = scene.add.particles(ex, ey, 'particle', {
                speed: { min: 80, max: 200 },
                angle: { min: 0, max: 360 },
                scale: { start: 1.2, end: 0 },
                blendMode: 'ADD',
                lifespan: 500,
                gravityY: 120,
                quantity: 22,
                tint: [0xff4400, 0xff8800, 0xffcc00],
                emitting: false
            }).setDepth(12);
            emitter.explode(22);
            scene.cameras.main.shake(120, 0.006);
            scene.time.delayedCall(700, () => { if (emitter.active) emitter.destroy(); });
        };
    
        const _doSplash = (scene, ex, ey, directTarget) => {
            scene.enemies.forEach(e => {
                if (e.dead || e === directTarget) return;
                const splashDist = Phaser.Math.Distance.Between(ex, ey, e.sprite.x, e.sprite.y);
                if (splashDist > SPLASH_RADIUS) return;
    
                let falloff;
                if (splashDist <= SPLASH_MIN_DIST) {
                    falloff = 1.0;
                } else {
                    const t = (splashDist - SPLASH_MIN_DIST) / (SPLASH_RADIUS - SPLASH_MIN_DIST);
                    falloff = 1.0 - t * (1.0 - SPLASH_DMG_PCT);
                }
    
                const baseDmg  = Phaser.Math.Between(DIRECT_DMG_MIN, DIRECT_DMG_MAX);
                const splashDmg = Math.round(baseDmg * falloff);
    
                const killed = e.takeDamage(splashDmg, dir, false);
                e.applyBurn(BURN_DMG, BURN_DURATION);
                if (killed) scene._checkVictory();
            });
        };
    }

    _updateFireballs() {
        this.fireballs = this.fireballs.filter(fb => {
            if (!fb || !fb.sprite || !fb.sprite.active) {
                if (fb?.trail?.active) fb.trail.destroy();
                return false;
            }
    
            fb.trail.setPosition(fb.sprite.x, fb.sprite.y);
    
            if (!fb.hasHit) {
                const hitEnemies = [];
                this.enemies.forEach(e => {
                    if (e.dead) return;
                    const dist = Phaser.Math.Distance.Between(
                        fb.sprite.x, fb.sprite.y, e.sprite.x, e.sprite.y
                    );
                    if (dist < 50) hitEnemies.push(e);
                });
    
                if (hitEnemies.length > 0) {
                    fb.hasHit = true;
                    const dir = fb.sprite.body.velocity.x > 0 ? 1 : -1;
    
                    const toHit = Phaser.Utils.Array.Shuffle(hitEnemies).slice(0, Phaser.Math.Between(1, 2));
                    toHit.forEach(e => {
                        const dmg = Phaser.Math.Between(20, 35);
                        e.takeDamage(dmg, dir, false);
                        e.applyBurn(8, 5000);
                    });
    
                    const SPLASH_RADIUS  = 120;
                    const SPLASH_MIN_DIST = 40;
                    const SPLASH_DMG_PCT  = 0.55;
    
                    this.enemies.forEach(e => {
                        if (e.dead || toHit.includes(e)) return;
                        const splashDist = Phaser.Math.Distance.Between(
                            fb.sprite.x, fb.sprite.y, e.sprite.x, e.sprite.y
                        );
                        if (splashDist > SPLASH_RADIUS) return;
    
                        const t = Math.max(0, (splashDist - SPLASH_MIN_DIST) / (SPLASH_RADIUS - SPLASH_MIN_DIST));
                        const falloff = 1.0 - t * (1.0 - SPLASH_DMG_PCT);
                        const splashDmg = Math.round(Phaser.Math.Between(20, 35) * falloff);
    
                        e.takeDamage(splashDmg, dir, false);
                        e.applyBurn(8, 5000);
                    });
    
                    this.cameras.main.shake(80, 0.006);
    
                    const explosion = this.add.particles(fb.sprite.x, fb.sprite.y, 'particle', {
                        speed: { min: 100, max: 200 },
                        angle: { min: 0, max: 360 },
                        scale: { start: 1, end: 0 },
                        blendMode: 'ADD',
                        lifespan: 500,
                        tint: [0xff4500, 0xff8800, 0xffaa00],
                        quantity: 20,
                        emitting: false
                    });
                    explosion.explode(20);
                    this.time.delayedCall(600, () => { if (explosion.active) explosion.destroy(); });
    
                    fb.sprite.destroy();
                    fb.trail.destroy();
                    return false;
                }
            }
    
            return true;
        });
    }

    _drawPixelBar(gfx, x, y, ratio, segments=10, segW=12, segH=8, gap=2) {
        const filled = Math.round(ratio * segments);
        gfx.fillStyle(0x330000, 1);
        for (let i = 0; i < segments; i++) gfx.fillRect(x + i*(segW+gap), y, segW, segH);
        for (let i = 0; i < filled; i++) {
            const sx = x + i*(segW+gap);
            gfx.fillStyle(0xcc1111, 1); gfx.fillRect(sx, y, segW, segH);
            gfx.fillStyle(0xff5555, 1); gfx.fillRect(sx+1, y+1, segW-3, 2);
        }
        gfx.lineStyle(1, 0x000000, 1);
        gfx.strokeRect(x-1, y-1, segments*(segW+gap)-gap+2, segH+2);
    }

    _drawHeart(gfx, x, y, color) {
        gfx.fillStyle(color, 1);
        const px = 2;
        [[0,1,1,0,1,1,0],[1,1,1,1,1,1,1],[1,1,1,1,1,1,1],
         [0,1,1,1,1,1,0],[0,0,1,1,1,0,0],[0,0,0,1,0,0,0]]
        .forEach((row, r) => row.forEach((v, c) => { if (v) gfx.fillRect(x+c*px, y+r*px, px, px); }));
    }

    _drawPlayerHpBar() {
        this.playerHpGraphics.clear();
        const ratio  = Math.max(0, this.playerHealth / this.playerMaxHealth);
        const heartX = 572, heartY = 16, barX = heartX+18, barY = heartY+2;
        this._drawHeart(this.playerHpGraphics, heartX, heartY, 0xff2222);
        this._drawPixelBar(this.playerHpGraphics, barX, barY, ratio, 12, 14, 10, 2);
        if (!this.playerHpText) {
            this.playerHpText = this.add.text(0, 0, '', {
                fontSize: '12px', fill: '#ffffff',
                stroke: '#000000', strokeThickness: 2, fontFamily: 'monospace'
            }).setScrollFactor(0).setDepth(21);
        }
        this.playerHpText.setPosition(barX, barY + 14);
        this.playerHpText.setText(`${this.playerHealth} / ${this.playerMaxHealth}`);
    }

    _checkVictory() {
        if (!this.firstVictory) {
            const wave1 = this.enemies.filter(en => !(this.wave2Enemies || []).includes(en));
            if (wave1.length > 0 && wave1.every(en => en.dead)) {
                this._triggerFirstVictory();
            }
            return;
        }
    
        if (this.firstVictory &&
            !this.secondVictoryTriggered &&
            this.wave2Enemies &&
            this.wave2Enemies.length > 0 &&
            this.wave2Enemies.every(en => en.dead)) {
            this.secondVictoryTriggered = true;
            this._triggerSecondVictory();
        }
    }
    
    update(time, delta) {
        if (this.gamePaused) return;
        const keys = this.keys;

      
        if (this.hasFireball) {
            this._updateFireballs();
            if (this.fireballCooldown > 0) {
                this.fireballCooldown = Math.max(0, this.fireballCooldown - delta);
            }

            this.fireballIconOverlay.clear();
            if (this.fireballCooldown > 0) {
                const ratio = this.fireballCooldown / this.fireballCooldownMax;
                const iconSize = 24*1.4;
                const iconX = this.fireballIcon.x - iconSize / 2;
                const iconY = this.fireballIcon.y - iconSize / 2;
                this.fireballIconOverlay.fillStyle(0x000000, 0.7);
                this.fireballIconOverlay.fillRect(iconX, iconY, iconSize, iconSize * ratio);
            }
        }
  
        if (Phaser.Input.Keyboard.JustDown(keys.fireball) && !this.jCharging) {
            this._launchFireball();
        }

        if (this.hasFireball && !this.hasMovedRight && !this.secondAreaTriggered) {
            const timeSinceFireball = time - this.fireballAcquiredTime;
            if (timeSinceFireball > 30000 && !this.arrowPrompt) {
                this.arrowPrompt = this.add.text(this.player.x + 100, this.player.y - 100, '→', {
                    fontSize: '64px',
                    fill: '#ffff00',
                    stroke: '#000000',
                    strokeThickness: 4
                }).setDepth(25);
                this.tweens.add({
                    targets: this.arrowPrompt,
                    x: this.player.x + 120,
                    duration: 800,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
            }

            if (this.arrowPrompt) {
                this.arrowPrompt.setPosition(this.player.x + 100, this.player.y - 100);
            }

            if (this.player.x > 1400) {
                this.hasMovedRight = true;
                this._createSecondArea();
            }
        }

        this._updateJudgement(delta);

        if (this.dashCooldown > 0) {
            this.dashCooldown = Math.max(0, this.dashCooldown - delta);
            this._drawDashCooldown(1 - this.dashCooldown / this.dashCooldownMax);
        }

        if (keys.down.isDown &&
            this.player.body.onFloor() &&
            !this.isAttacking &&
            !this.jCharging) {
            if (!this.isCharging) {
                this.isCharging   = true;
                this.chargeAmount = 0;
                this.chargeBarBg  = this.add.graphics();
                this.chargeBarBg.fillStyle(0x000000, 0.5);
                this.chargeBarBg.fillRect(0, 0, 102, 12);
                this.chargeBar = this.add.graphics();
            }
            this.chargeAmount = Math.min(this.chargeAmount + (delta/1000)/this.maxChargeTime, 1);
            const bx = this.player.x - 50, by = this.player.y - 100;
            this.chargeBarBg.setPosition(bx - 1, by - 1);
            this.chargeBar.clear();
            this.chargeBar.fillStyle(0xffffff, 1);
            this.chargeBar.fillRect(bx, by, 100 * this.chargeAmount, 10);
        } else if (this.isCharging && !keys.down.isDown) {
            this.player.setVelocityY(this.chargeAmount >= 1 ? -290 : -210);
            if (this.chargeAmount >= 1) {
                const em = this.add.particles(this.player.x, this.player.y, 'particle', {
                    speed:{min:100,max:200}, angle:{min:0,max:360},
                    scale:{start:1,end:0}, blendMode:'ADD',
                    lifespan:600, gravityY:200, quantity:15, tint:0xffffff, emitting:false
                });
                em.explode(15);
                this.time.delayedCall(800, () => em.destroy());
            }
            if (this.chargeBar)   { this.chargeBar.destroy();   this.chargeBar   = null; }
            if (this.chargeBarBg) { this.chargeBarBg.destroy(); this.chargeBarBg = null; }
            this.isCharging  = false;
            this.chargeAmount = 0;
        }
        const canDash = this.dashCooldown <= 0 && !this.isDashing && !this.jCharging;
        if (Phaser.Input.Keyboard.JustDown(keys.right)) {
            if (time - this.lastTapRight < 280 && canDash) {
                this.isDashing     = true;
                this.dashCooldown  = this.dashCooldownMax;
                this._drawDashCooldown(0);
                this._startDash(1 )
                this.time.delayedCall(200, () => { this.isDashing = false; this.player.clearTint(); });
            }
            this.lastTapRight = time;
        }
        if (Phaser.Input.Keyboard.JustDown(keys.left)) {
            if (time - this.lastTapLeft < 280 && canDash) {
                this.isDashing     = true;
                this.dashCooldown  = this.dashCooldownMax;
                this._drawDashCooldown(0);
                this._startDash(-1 )
                this.time.delayedCall(200, () => { this.isDashing = false; this.player.clearTint(); });
            }
            this.lastTapLeft = time;
        }

        if (!this.isDashing && !this.gamePaused) {
            if (keys.left.isDown && !this.isAttacking) {
                this.player.setVelocityX(-220);
                this.player.anims.play('left', true);
                this.player.setFlipX(true);
            } else if (keys.right.isDown && !this.isAttacking) {
                this.player.setVelocityX(220);
                this.player.setFlipX(false);
                this.player.anims.play('right', true);
            } else if (!this.isAttacking) {
                this.player.setVelocityX(0);
                this.player.anims.play('idle', true);
                this.player.setFlipX(false);
            }
        }

        if (keys.up.isDown &&
            this.player.body.onFloor() &&
            !this.isAttacking &&
            !this.isCharging &&
            !this.jCharging) {
            this.player.setVelocityY(-220);
        }

        this.enemies.forEach(e => e.update(delta, this.player));
    }
    _startDash(dir) {
        this.isDashing     = true;
        this.dashCooldown  = this.dashCooldownMax;
        this.player.setVelocityX(dir * 520);
        this.player.setFlipX(dir === -1);

        // Dash afterimage trail
        for (let i = 0; i < 5; i++) {
            this.time.delayedCall(i * 30, () => {
                if (!this.player.active) return;
                const ghost = this.add.image(this.player.x, this.player.y, 'char')
                    .setScale(1.4).setAlpha(0.35).setDepth(9).setFlipX(this.player.flipX);
                this.tweens.add({ targets: ghost, alpha: 0, duration: 200,
                    onComplete: () => ghost.destroy() });
            });
        }

        this.time.delayedCall(200, () => {
            this.isDashing = false;
            this.player.setVelocityX(0);
        });
    }
}