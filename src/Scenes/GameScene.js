import * as Phaser from 'phaser';

// ─────────────────────────────────────────────────────────────────────────────
// GAME SCENE (Tutorial / Level 1)
// ─────────────────────────────────────────────────────────────────────────────
export class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
    }

    preload() {
        this.load.setPath('assets');
        this.load.spritesheet('enemy1_idle','./enemies/Goblin/Idle.png',{ frameWidth: 150, frameHeight: 150 });
        this.load.spritesheet('enemy1_attack','./enemies/Goblin/Attack1.png',{ frameWidth: 150, frameHeight: 150 });
        this.load.spritesheet('enemy1_take_hit','./enemies/Goblin/Take Hit.png',{ frameWidth: 150, frameHeight: 150 });
        this.load.spritesheet('enemy1_die','./enemies/Goblin/Death.png',{ frameWidth: 150, frameHeight: 150 });
        this.load.spritesheet('enemy1_run','./enemies/Goblin/Run.png',{ frameWidth: 150, frameHeight: 150 });
        this.load.spritesheet('attack','Attack1.png',{ frameWidth: 200, frameHeight: 200 });
        this.load.image('sword','blade.png');
        this.load.image('plat1','tileset.png');
        this.load.image('plat2','long_platform.png');
        this.load.image('plat3','platform.png');
        this.load.spritesheet('run',"Run.png",{ frameWidth: 200, frameHeight: 200 });
        this.load.spritesheet('jump','Jump.png',{ frameWidth: 200, frameHeight: 200 });
        this.load.image('background', 'background.png');
        this.load.image('floor', 'floor.png');
        this.load.spritesheet('char','Idle.png',{ frameWidth: 200, frameHeight: 200 });
    }

    create() {
        this.physics.world.setBounds(0, 0, 2400, 600);
        this.bg = this.add.tileSprite(1200, 300, 2400, 600, 'background');

        const floor = this.add.tileSprite(1200, 600, 2400, 110, 'floor').setOrigin(0.5, 1);
        this.keys = this.input.keyboard.addKeys({
            left:  Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
            up:    Phaser.Input.Keyboard.KeyCodes.SPACE,
            down:  Phaser.Input.Keyboard.KeyCodes.S
        });
        this.physics.add.existing(floor, true);
        floor.body.setSize(2400, 110);
        floor.body.updateFromGameObject();

        // Victory already triggered flag (prevents double-firing)
        this.victoryTriggered = false;

        // --- Player ---
        this.player = this.physics.add.sprite(100, 450, 'char');
        this.player.setBounce(0.2);
        this.player.setScale(1.4);
        this.player.setCollideWorldBounds(true);
        this.player.body.setSize(40, 40);
        this.player.body.setOffset(80, 80);
        this.player.setDrag(0, 0);        // remove all drag resistance
        this.player.setMaxVelocity(220, 800); // cap so nothing goes wild

        this.isAttacking = false;
        this.hasMovedYet = false;
        this.hasSword =false;
        this.playerHealth = 500;
        this.playerMaxHealth = 500;
        this.playerInvincible = false;
        this.isCharging = false;
        this.chargeAmount = 0;
        this.maxChargeTime = 0.4;
        this.hasShownJumpTutorial = false;
        this.chargeBar = null;
        this.chargeBarBg = null;

        this.tutorialText = this.add.text(400, 100, 'Press A / D  to move\nPress [Space] to Jump', {
            fontSize: '32px', fill: '#ffffff',
            stroke: '#000000', strokeThickness: 4, align: 'center'
        }).setOrigin(0.5).setScrollFactor(0);

        this.attackHintText = this.add.text(400, 260, 'Left click to attack', {
            fontSize: '26px', fill: '#ffee55',
            stroke: '#000000', strokeThickness: 4, align: 'center'
        }).setOrigin(0.5).setScrollFactor(0).setVisible(false);
        this.attackHintVisible = false;

        this.platforms = this.physics.add.staticGroup();

        // --- Enemy ---
        this.enemy = this.physics.add.sprite(2100, 250, 'enemy1_idle');
        this.enemyHealth = 100;
        this.enemyMaxHealth = 100;
        this.enemyDead = false;
        this.enemyAggroed = false;
        this.enemyInvincible = false;
        this.enemyAttacking = false;
        this.enemyAttackCooldown = 0;
        this.enemyAnimLocked = false;
        this.enemy.setBounce(0.2);
        this.enemy.setScale(1.4);
        this.enemy.setCollideWorldBounds(true);
        this.enemy.body.setSize(40, 40);
        this.enemy.body.setOffset(55, 60);

        this.enemyHpBg  = this.add.graphics();
        this.enemyHpBar = this.add.graphics();
        this._drawEnemyHpBar();

        this.playerHpGraphics = this.add.graphics().setScrollFactor(0);
        this._drawPlayerHpBar();

        // --- Platforms ---
        const plat1 = this.platforms.create(900, 260, 'plat1');
        plat1.body.setSize(200, 50); plat1.refreshBody();
        const plat2 = this.platforms.create(1200, 200, 'plat1');
        plat2.body.setSize(200, 50); plat2.refreshBody();
        const plat3 = this.platforms.create(1100, 380, 'plat1');
        plat3.body.setSize(200, 50); plat3.refreshBody();

        this.sword = this.add.sprite(1200, 170, 'sword');
        this.sword.setScale(0.4);
        this.jumpTutorialText = null;

        // --- Animations ---
        this.anims.create({ key: 'idle',           frames: this.anims.generateFrameNumbers('char',            {start:0,end:7}), frameRate: 8,  repeat: -1 });
        this.anims.create({ key: 'left',           frames: this.anims.generateFrameNumbers('run',             {start:0,end:7}), frameRate: 10, repeat: -1 });
        this.anims.create({ key: 'right',          frames: this.anims.generateFrameNumbers('run',             {start:0,end:7}), frameRate: 10, repeat: -1 });
        this.anims.create({ key: 'attack',         frames: this.anims.generateFrameNumbers('attack',          {start:0,end:5}), frameRate: 10, repeat:  0 });
        this.anims.create({ key: 'jump',           frames: this.anims.generateFrameNumbers('jump',            {start:0,end:1}), frameRate:8,   repeat:  0 });
        this.anims.create({ key: 'enemy_idle',     frames: this.anims.generateFrameNumbers('enemy1_idle',     {start:0,end:3}), frameRate: 8,  repeat: -1 });
        this.anims.create({ key: 'enemy_run',      frames: this.anims.generateFrameNumbers('enemy1_run',      {start:0,end:7}), frameRate: 10, repeat: -1 });
        this.anims.create({ key: 'enemy_attack',   frames: this.anims.generateFrameNumbers('enemy1_attack',   {start:0,end:7}), frameRate: 10, repeat:  0 });
        this.anims.create({ key: 'enemy_take_hit', frames: this.anims.generateFrameNumbers('enemy1_take_hit', {start:0,end:3}), frameRate: 10, repeat:  0 });
        this.anims.create({ key: 'enemy_die',      frames: this.anims.generateFrameNumbers('enemy1_die',      {start:0,end:3}), frameRate: 8,  repeat:  0 });

        // --- Input ---
        this.input.on('pointerdown', (pointer) => {
            if (pointer.leftButtonDown()) {
                if (!this.enemyAggroed && !this.enemyDead) this._triggerAggro();
                if (!this.isAttacking && this.hasSword) {
                    this.isAttacking = true;
                    this.player.setVelocityX(0);
                    this.player.anims.play('attack');
                    this._tryHitEnemy();
                }
            }
        });

        this.player.on('animationcomplete', (anim) => {
            if (anim.key === 'attack') this.isAttacking = false;
        });

        this.enemy.on('animationcomplete', (anim) => {
            if (this.enemyDead) return;
            if (anim.key === 'enemy_attack') {
                this.enemyAttacking = false;
                this.enemyAnimLocked = false;
                this.enemy.anims.play('enemy_idle', true);
            }
            if (anim.key === 'enemy_take_hit') {
                this.enemyAnimLocked = false;
                this.enemy.anims.play(this.enemyAggroed ? 'enemy_run' : 'enemy_idle', true);
            }
        });

        // --- Colliders ---
        this.physics.add.collider(this.player, floor);
        this.physics.add.collider(this.enemy, floor);
        this.physics.add.collider(this.player, this.platforms);
        this.physics.add.collider(this.enemy, this.platforms);

        this.swordPickupEnabled = true;
        this.player.anims.play('idle');
       
    this.cameras.main.centerOn(this.player.x, this.player.y); // snap first
    this.cameras.main.startFollow(this.player, true, 0.26, 0.26); // then lerp
        this.cameras.main.setBounds(0, 0, 2400, 600);

        const gfx = this.make.graphics({ x: 0, y: 0, add: false });
        gfx.fillStyle(0xffffff, 1);
        gfx.fillCircle(4, 4, 4);
        gfx.generateTexture('particle', 8, 8);
        gfx.destroy();
// In create(), after adding keys:
this.inputActive = false;
this.time.delayedCall(100, () => { this.inputActive = true; });
    }

    // ─── Victory ──────────────────────────────────────────────────────────────
    _triggerVictory() {
        if (this.victoryTriggered) return;
        this.victoryTriggered = true;

        // Pause player input
        this.physics.pause();
        this.player.anims.play('idle', true);

        // Dark overlay
        const overlay = this.add.graphics().setScrollFactor(0).setDepth(10);
        overlay.fillStyle(0x000000, 0.45);
        overlay.fillRect(0, 0, 800, 600);

        // Victory text
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

        // Pulse animation on victory text
        this.tweens.add({
            targets: victoryText,
            scaleX: 1.08, scaleY: 1.08,
            duration: 500, yoyo: true, repeat: -1,
            ease: 'Sine.easeInOut'
        });

       

        // Transition to Level2Scene after 2 seconds
        this.time.delayedCall(2000, () => {
            this.cameras.main.fadeOut(800, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('Level2Scene');
            });
        });
    }

    // ─── Aggro ────────────────────────────────────────────────────────────────
    _triggerAggro() {
        this.enemyAggroed = true;
        if (this.attackHintVisible) {
            this.attackHintVisible = false;
            this.attackHintText.setVisible(false);
        }
    }

    // ─── Enemy HP bar ─────────────────────────────────────────────────────────
    _drawEnemyHpBar() {
        const bw = 60, bh = 8;
        const ex = this.enemy.x - bw / 2;
        const ey = this.enemy.y - 85;
        this.enemyHpBg.clear();
        this.enemyHpBg.fillStyle(0x000000, 0.6);
        this.enemyHpBg.fillRect(ex - 1, ey - 1, bw + 2, bh + 2);
        this.enemyHpBar.clear();
        const ratio = Math.max(0, this.enemyHealth / this.enemyMaxHealth);
        this.enemyHpBar.fillStyle(0xff2222, 1);
        this.enemyHpBar.fillRect(ex, ey, bw * ratio, bh);
    }

    // ─── Player HP bar ────────────────────────────────────────────────────────
    _drawPixelBar(gfx, x, y, ratio, segments = 10, segW = 12, segH = 8, gap = 2) {
        const filled = Math.round(ratio * segments);
        gfx.fillStyle(0x330000, 1);
        for (let i = 0; i < segments; i++) gfx.fillRect(x + i * (segW + gap), y, segW, segH);
        for (let i = 0; i < filled; i++) {
            const sx = x + i * (segW + gap);
            gfx.fillStyle(0xcc1111, 1);
            gfx.fillRect(sx, y, segW, segH);
            gfx.fillStyle(0xff5555, 1);
            gfx.fillRect(sx + 1, y + 1, segW - 3, 2);
        }
        gfx.lineStyle(1, 0x000000, 1);
        gfx.strokeRect(x - 1, y - 1, segments * (segW + gap) - gap + 2, segH + 2);
    }

    _drawHeart(gfx, x, y, color) {
        gfx.fillStyle(color, 1);
        const px = 2;
        const pattern = [
            [0,1,1,0,1,1,0],
            [1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1],
            [0,1,1,1,1,1,0],
            [0,0,1,1,1,0,0],
            [0,0,0,1,0,0,0],
        ];
        for (let row = 0; row < pattern.length; row++)
            for (let col = 0; col < pattern[row].length; col++)
                if (pattern[row][col]) gfx.fillRect(x + col * px, y + row * px, px, px);
    }

    _drawPlayerHpBar() {
        this.playerHpGraphics.clear();
        const ratio = Math.max(0, this.playerHealth / this.playerMaxHealth);
        const heartX = 572, heartY = 16;
        const barX = heartX + 18, barY = heartY + 2;
        this._drawHeart(this.playerHpGraphics, heartX, heartY, 0xff2222);
        this._drawPixelBar(this.playerHpGraphics, barX, barY, ratio, 12, 14, 10, 2);
        if (!this.playerHpText) {
            this.playerHpText = this.add.text(0, 0, '', {
                fontSize: '12px', fill: '#ffffff',
                stroke: '#000000', strokeThickness: 2, fontFamily: 'monospace'
            }).setScrollFactor(0);
        }
        this.playerHpText.setPosition(barX, barY + 14);
        this.playerHpText.setText(`${this.playerHealth} / ${this.playerMaxHealth}`);
    }

    // ─── Combat ───────────────────────────────────────────────────────────────
    _tryHitEnemy() {
        if (this.enemyDead || this.enemyInvincible) return;
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.enemy.x, this.enemy.y);
        if (dist < 150) {
            const dmg = Phaser.Math.Between(15, 25);
            this.enemyHealth = Math.max(0, this.enemyHealth - dmg);
            this._drawEnemyHpBar();
            this.cameras.main.shake(55, 0.002);
            this.enemyInvincible = true;
            this.time.delayedCall(350, () => { this.enemyInvincible = false; });
            if (this.enemyHealth <= 0) {
                this._killEnemy();
            } else if (!this.enemyAnimLocked) {
                this.enemyAnimLocked = true;
                this.enemyAttacking = false;
                this.enemy.anims.play('enemy_take_hit', true);
            }
        }
    }

    _enemyAttackPlayer() {
        if (this.playerInvincible || this.enemyDead) return;
        this.playerHealth = Math.max(0, this.playerHealth - 45);
        this._drawPlayerHpBar();
        this.playerInvincible = true;
        this.cameras.main.shake(150, 0.008);
        this.time.delayedCall(600, () => { this.playerInvincible = false; });
        if (this.playerHealth <= 0) {
            
            showDeathScreen()
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
    _killEnemy() {
        this.enemyDead = true;
        this.enemy.setVelocityX(0);
        this.enemyAnimLocked = true;
        this.enemy.anims.play('enemy_die', true);
        this.enemyHpBg.clear();
        this.enemyHpBar.clear();

        this._deathListened = false;
        this.enemy.on('animationcomplete', (anim) => {
            if (anim.key === 'enemy_die' && !this._deathListened) {
                this._deathListened = true;
                this.time.delayedCall(400, () => {
                    this.enemy.destroy();
                    this.enemyHpBg.destroy();
                    this.enemyHpBar.destroy();
                    // ← Victory fires here, after enemy fully dies
                    this._triggerVictory();
                });
            }
        });
    }

    // ─── Update ───────────────────────────────────────────────────────────────
    update(time, delta) {
        
   
if (!this.inputActive) {
    this.player.anims.play('idle', true);
    return; // skip all input processing for first 100ms
}
        if (this.victoryTriggered) return; // freeze input during victory
        const keys = this.keys;

        if (!this.hasShownJumpTutorial && this.player.x > 600) {
            this.hasShownJumpTutorial = true;
            this.jumpTutorialText = this.add.text(400, 100, 'Hold S to super-jump', {
                fontSize: '32px', fill: '#ffffff',
                stroke: '#000000', strokeThickness: 4, align: 'center'
            }).setOrigin(0.5).setScrollFactor(0);
            this.time.delayedCall(4000, () => { if (this.jumpTutorialText) this.jumpTutorialText.destroy(); });
        }

        if (keys.down.isDown && this.player.body.onFloor() && !this.isAttacking) {
            if (!this.isCharging) {
                this.isCharging = true;
                this.chargeAmount = 0;
                this.chargeBarBg = this.add.graphics();
                this.chargeBarBg.fillStyle(0x000000, 0.5);
                this.chargeBarBg.fillRect(0, 0, 102, 12);
                this.chargeBar = this.add.graphics();
            }
            this.chargeAmount = Math.min(
                this.chargeAmount + (Math.min(delta, 50) / 1000) / this.maxChargeTime,
                1
            );
            const barX = this.player.x - 50, barY = this.player.y - 100;
            this.chargeBarBg.setPosition(barX - 1, barY - 1);
            this.chargeBar.clear();
            this.chargeBar.fillStyle(0xffffff, 1);
            this.chargeBar.fillRect(barX, barY, 100 * this.chargeAmount, 10);
        } else if (this.isCharging && !keys.down.isDown) {
            const jumpPower = this.chargeAmount >= 1 ? -290 : -210;
            this.player.setVelocityY(jumpPower);
            this.player.anims.play('jump',true)
            if (this.chargeAmount >= 1) {
                const emitter = this.add.particles(this.player.x, this.player.y, 'particle', {
                    speed: { min: 100, max: 200 }, angle: { min: 0, max: 360 },
                    scale: { start: 1, end: 0 }, blendMode: 'ADD',
                    lifespan: 600, gravityY: 200, quantity: 15, tint: 0xffffff, emitting: false
                });
                emitter.explode(15);
                this.time.delayedCall(800, () => { emitter.destroy(); });
            }
            if (this.chargeBar) { this.chargeBar.destroy(); this.chargeBar = null; }
            if (this.chargeBarBg) { this.chargeBarBg.destroy(); this.chargeBarBg = null; }
            this.isCharging = false;
            this.chargeAmount = 0;
        }

        if (!this.hasMovedYet && (keys.left.isDown || keys.right.isDown || keys.up.isDown)) {
            this.hasMovedYet = true;
            this.tutorialText.destroy();
        }

        if (!this.enemyAggroed && !this.enemyDead && this.hasSword) {
            const dx = Math.abs(this.player.x - this.enemy.x);
            const dy = Math.abs(this.player.y - this.enemy.y);
            if (dx < 175 && dy < 120) this._triggerAggro();
        }

        if (this.swordPickupEnabled && this.sword) {
            const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.sword.x, this.sword.y);
            if (d < 50) {
                this.sword.destroy();
                this.hasSword = true;
                this.swordPickupEnabled = false;
                this.attackHintVisible = true;
                this.attackHintText.setVisible(true);
                const pickupText = this.add.text(400, 150, 'Sword acquired!', {
                    fontSize: '28px', fill: '#ffff00', stroke: '#000000', strokeThickness: 3
                }).setOrigin(0.5).setScrollFactor(0);
                this.time.delayedCall(2000, () => { pickupText.destroy(); });
            }
        }

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

        if (keys.up.isDown && this.player.body.onFloor() && !this.isAttacking && !this.isCharging) {
            this.player.setVelocityY(-220);
        }

        if (!this.enemyDead) {
            this._drawEnemyHpBar();
            const distToPlayer = Phaser.Math.Distance.Between(this.enemy.x, this.enemy.y, this.player.x, this.player.y);
            const attackRange = 80, enemySpeed = 100;

            if (this.enemyAggroed && !this.enemyAnimLocked) {
                if (distToPlayer > attackRange) {
                    const dir = this.player.x < this.enemy.x ? -1 : 1;
                    this.enemy.setVelocityX(dir * enemySpeed);
                    this.enemy.setFlipX(dir === -1);
                    if (!this.enemyAttacking) this.enemy.anims.play('enemy_run', true);
                } else {
                    this.enemy.setVelocityX(0);
                    this.enemyAttackCooldown -= delta;
                    if (this.enemyAttackCooldown <= 0 && !this.enemyAttacking && this.playerHealth >= 0) {
                        this.enemyAttacking = true;
                        this.enemyAnimLocked = true;
                        this.enemy.anims.play('enemy_attack', true);
                        this.enemyAttackCooldown = 1000;
                        this.time.delayedCall(500, () => {
                            if (this.enemyDead) return;
                            const d = Phaser.Math.Distance.Between(this.enemy.x, this.enemy.y, this.player.x, this.player.y);
                            if (d < attackRange + 20) this._enemyAttackPlayer();
                        });
                    } else if (!this.enemyAttacking) {
                        this.enemy.anims.play('enemy_idle', true);
                    }
                }
            } else if (!this.enemyAggroed) {
                this.enemy.setVelocityX(0);
                this.enemy.anims.play('enemy_idle', true);
            }
        }
    }
}