import * as Phaser from 'phaser';

"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// Platform registry  { x: centre, y: top-surface, w: half-width }
// ─────────────────────────────────────────────────────────────────────────────
const PLATFORMS = [
    
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
// Alt Ego (Mirror Boss - Phase 3)
// ─────────────────────────────────────────────────────────────────────────────
class AltEgo {
    constructor(scene, x, y) {
        this.scene = scene;
        this.dead = false;
        this.maxHp = 350;
        this.hp = this.maxHp;
        this.speed = 180;
        this.damage = Phaser.Math.Between(30,35);
        this.invincible = false;
        this.attacking = false;
        this.animLocked = false;
        
        // Frost breath ability
        this.frostBreathCooldown = 0;
        this.frostBreathCDMax = 5000;
        this.frostBreathActive = false;
        this.frostParticles = null;
        
        // AI state
        this.aiState = 'chase'; // chase, attack, dodge, frost
        this.dodgeChance = 0.15; // 15% chance to dodge
        this.lastDodgeTime = 0;
        this.dodgeCooldown = 8000;
        
        this.sprite = scene.physics.add.sprite(x, y, 'altego_idle');
        this.sprite.setScale(1.4);
        this.sprite.setCollideWorldBounds(true);
        this.sprite.setBounce(0.2);
        this.sprite.body.setSize(40, 40);
        this.sprite.body.setOffset(80, 80);
        this.sprite.setFlipX(true); // Flip all animations
        this.sprite.setTint(0x6600cc); // Purple tint for mirror effect
        
        this.hpBg = scene.add.graphics().setDepth(48);
        this.hpBar = scene.add.graphics().setDepth(49);
        
        this.sprite.anims.play('altego_idle', true);
        
        this.sprite.on('animationcomplete', (anim) => {
            if (this.dead) return;
            if (anim.key === 'altego_attack') {
                this.attacking = false;
                this.animLocked = false;
                this.sprite.anims.play('altego_idle', true);
            }
        });
    }
    
    _drawHpBar() {
        if (!this.hpBg || !this.hpBar || !this.hpBg.active || !this.hpBar.active) return;
        const bw = 80, bh = 10;
        const ex = this.sprite.x - bw / 2;
        const ey = this.sprite.y - 90;
        
        this.hpBg.clear();
        this.hpBg.fillStyle(0x000000, 0.8);
        this.hpBg.fillRect(ex - 1, ey - 1, bw + 2, bh + 2);
        
        this.hpBar.clear();
        const ratio = Math.max(0, this.hp / this.maxHp);
        const color = ratio > 0.5 ? 0x6600cc : ratio > 0.25 ? 0x8800ff : 0xaa00ff;
        this.hpBar.fillStyle(color, 1);
        this.hpBar.fillRect(ex, ey, bw * ratio, bh);
        this.hpBar.fillStyle(0xcc88ff, 0.5);
        this.hpBar.fillRect(ex, ey + 1, bw * ratio, 3);
    }
    
    takeDamage(dmg, knockbackDir) {
        if (this.dead || this.invincible) return false;
        
        // Dodge chance
        const now = this.scene.time.now;
        if (now - this.lastDodgeTime > this.dodgeCooldown) {
            if (Math.random() < this.dodgeChance) {
                this.lastDodgeTime = now;
                this._dodge(knockbackDir);
                return false;
            }
        }
        
        this.hp = Math.max(0, this.hp - dmg);
        this._drawHpBar();
        
        this.sprite.setVelocityX(knockbackDir * 200);
        this.sprite.setTintFill(0xffffff);
        this.scene.time.delayedCall(110, () => { 
            if (!this.dead) this.sprite.setTint(0x6600cc); 
        });
        
        this.invincible = true;
        this.scene.time.delayedCall(300, () => { this.invincible = false; });
        
        if (this.hp <= 0) {
            this._die();
            return true;
        }
        
        return false;
    }
    
    _dodge(attackDir) {
        // Dodge in opposite direction of attack
        const dodgeDir = -attackDir;
        this.sprite.setVelocityX(dodgeDir * 350);
        this.sprite.setVelocityY(-180);
        
        // Dodge visual
        this.sprite.setAlpha(0.5);
        this.scene.time.delayedCall(400, () => {
            if (this.sprite.active) this.sprite.setAlpha(1);
        });
        
        // Dodge text
        const dodgeTxt = this.scene.add.text(this.sprite.x, this.sprite.y - 70, 'DODGE!', {
            fontSize: '16px', fill: '#ffff00',
            stroke: '#000000', strokeThickness: 3, fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(50);
        
        this.scene.tweens.add({
            targets: dodgeTxt,
            y: dodgeTxt.y - 30,
            alpha: 0,
            duration: 800,
            onComplete: () => dodgeTxt.destroy()
        });
    }
    
    _die() {
        this.dead = true;
        this.sprite.setVelocityX(0);
        this.sprite.setVelocityY(0);
        this.sprite.body.setEnable(false);
        this.animLocked = true;
        
        if (this.hpBg) { this.hpBg.destroy(); this.hpBg = null; }
        if (this.hpBar) { this.hpBar.destroy(); this.hpBar = null; }
        
        if (this.frostParticles?.active) {
            this.frostParticles.destroy();
            this.frostParticles = null;
        }
        
        this.sprite.anims.play('altego_death', true);
        
        this.sprite.once('animationcomplete', () => {
            this.scene.time.delayedCall(350, () => {
                if (this.sprite?.active) this.sprite.destroy();
            });
        });
    }
    
    _useFrostBreath(player) {
        this.frostBreathActive = true;
        this.frostBreathCooldown = this.frostBreathCDMax;
        this.animLocked = true;
        this.attacking = true;
        
        this.sprite.anims.play('altego_attack', true);
        const dodgeTxt = this.scene.add.text(this.sprite.x, this.sprite.y - 70, 'BREATH INCOMING!', {
            fontSize: '16px', fill: '#ffff00',
            stroke: '#000000', strokeThickness: 3, fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(50);
        this.scene.tweens.add({
            targets: dodgeTxt,
            y: dodgeTxt.y - 30,
            alpha: 0,
            duration: 800,
            onComplete: () => dodgeTxt.destroy()
        });
        
        // Frost direction
        const frostDir = this.sprite.flipX ? -1 : 1;
        const frostX = this.sprite.x + (frostDir * 40);
        const frostY = this.sprite.y;
        
        // Frost breath particles
        this.frostParticles = this.scene.add.particles(frostX, frostY, 'particle', {
            speed: { min: 100, max: 180 },
            angle: frostDir > 0 ? { min: -20, max: 20 } : { min: 160, max: 200 },
            scale: { start: 1.5, end: 0.3 },
            blendMode: 'ADD',
            lifespan: 1200,
            tint: [0x44ccff, 0x88ddff, 0xccffff],
            frequency: 40,
            gravityY: 50
        }).setDepth(47);
        
        // Damage zone
        const damageCheckInterval = this.scene.time.addEvent({
            delay: 50,
            repeat: 24, // ~1.2 seconds
            callback: () => {
                if (this.dead) {
                    damageCheckInterval.remove();
                    return;
                }
                
                // Check if player is in frost range (75px)
                const dx = player.x - this.sprite.x;
                const dy = Math.abs(player.y - this.sprite.y);
                const inRange = Math.abs(dx) < 75 && dy < 60;
                const correctSide = (frostDir > 0 && dx > 0) || (frostDir < 0 && dx < 0);
                
                if (inRange && correctSide && !this.scene.playerInvincible) {
                    this.scene._enemyHitPlayer(12); // Damage per tick
                }
            }
        });
        
        this.scene.time.delayedCall(1200, () => {
            this.frostBreathActive = false;
            if (this.frostParticles?.active) {
                this.frostParticles.destroy();
                this.frostParticles = null;
            }
        });
    }
    
    _doMeleeAttack(player) {
        if (this.attacking || this.animLocked) return;
        
        this.attacking = true;
        this.animLocked = true;
        this.sprite.anims.play('altego_attack', true);
        
        this.scene.time.delayedCall(350, () => {
            if (this.dead) return;
            const dist = Phaser.Math.Distance.Between(
                this.sprite.x, this.sprite.y, player.x, player.y
            );
            if (dist < 100 && !this.scene.playerInvincible) {
                this.scene._enemyHitPlayer(this.damage);
            }
        });
    }
    
    update(delta, player) {
        if (this.dead) return;
        
        this._drawHpBar();
        
        // Update frost breath cooldown
        if (this.frostBreathCooldown > 0) {
            this.frostBreathCooldown = Math.max(0, this.frostBreathCooldown - delta);
        }
        
        // Update frost particles position
        if (this.frostParticles?.active) {
            const frostDir = this.sprite.flipX ? -1 : 1;
            this.frostParticles.setPosition(
                this.sprite.x + (frostDir * 40),
                this.sprite.y
            );
        }
        
        if (this.animLocked || this.frostBreathActive) return;
        
        const dist = Phaser.Math.Distance.Between(
            this.sprite.x, this.sprite.y, player.x, player.y
        );
        
        // AI decision making
        if (this.frostBreathCooldown <= 0 && dist < 150 && Math.random() < 0.3) {
            // Use frost breath
            this._useFrostBreath(player);
        } else if (dist < 90) {
            // Melee range - attack
            this.sprite.setVelocityX(0);
            this._doMeleeAttack(player);
        } else if (dist < 400) {
            // Chase range
            const dir = player.x > this.sprite.x ? 1 : -1;
            this.sprite.setVelocityX(dir * this.speed);
            this.sprite.setFlipX(dir === -1);
            this.sprite.anims.play('altego_run', true);
            
            // Jump if player is above
            if (player.y < this.sprite.y - 30 && this.sprite.body.onFloor()) {
                this.sprite.setVelocityY(-220);
            }
        } else {
            // Idle
            this.sprite.setVelocityX(0);
            if (!this.attacking) {
                this.sprite.anims.play('altego_idle', true);
            }
        }
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Enemy
// ─────────────────────────────────────────────────────────────────────────────
class Enemy {
    constructor(scene, x, y, type) {
        this.scene          = scene;
        this.type           = type;
        this.dead           = false;
        this.aggroed        = true;
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
        this._relocateTimer = 1000000;
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
// Boos fight scene
// ─────────────────────────────────────────────────────────────────────────────
export class BossFightScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BossFightScene' });
    }
    
    preload() {

        this.load.setPath('assets');
        this.load.image('potion', 'potion.png');

        // Boss sprites
        this.load.image('orb', './enemies/final_boss/orb.png');
       
        this.load.spritesheet('boss_idle',   './enemies/final_boss/idle.png',   { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('boss_idle2',  './enemies/final_boss/idle2.png',  { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('boss_attack', './enemies/final_boss/attack.png', { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('boss_death',  './enemies/final_boss/death.png',  { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('boss_skill1', './enemies/final_boss/skill1.png', { frameWidth: 100, frameHeight: 100 });
        this.load.spritesheet('boss_summon', './enemies/final_boss/summon.png', { frameWidth: 100, frameHeight: 100 });

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

        this.load.image('background_boss', 'bg_boss.jpeg');
        this.load.image('floor',      'floor.png');
        this.load.spritesheet('char', 'Idle.png', { frameWidth: 200, frameHeight: 200 });

        // Mirror Realm - Alt Ego sprites (same dimensions as player: 200x200)
        this.load.spritesheet('altego_idle',   './mirror/altEgo/Idle.png',      { frameWidth: 200, frameHeight: 200 });
        this.load.spritesheet('altego_run',    './mirror/altEgo/Run.png',       { frameWidth: 200, frameHeight: 200 });
        this.load.spritesheet('altego_attack', './mirror/altEgo/Attack1.png',   { frameWidth: 200, frameHeight: 200 });
        this.load.spritesheet('altego_death',  './mirror/altEgo/Death.png',     { frameWidth: 200, frameHeight: 200 });
        
        // Mirror background
        this.load.image('mirror_bg', './mirror/dark.png');

        this.load.image('scroll',        'scroll.png');
        this.load.spritesheet('skills', 'skills.png', {frameWidth : 24, frameHeight:24});
        this.load.image('flame',         'flame.png');
    }

    create() {
        this.physics.world.setBounds(0, 0, 3600, 600);
       
        const bgHeight = 490;
        this.bg = this.add.image(400, bgHeight / 2, 'background_boss');
        this.bg.setScale(Math.max(800 / 318, bgHeight / 159));


        const floor = this.add.tileSprite(400, 600, 1000, 110, 'floor').setOrigin(0.5, 1);
        this.physics.add.existing(floor, true);
        floor.body.setSize(800, 110);
        floor.body.updateFromGameObject();
        this._floor = floor;
        

        this.keys = this.input.keyboard.addKeys({
            left:     Phaser.Input.Keyboard.KeyCodes.A,
            right:    Phaser.Input.Keyboard.KeyCodes.D,
            up:       Phaser.Input.Keyboard.KeyCodes.SPACE,
            down:     Phaser.Input.Keyboard.KeyCodes.S,
            fireball: Phaser.Input.Keyboard.KeyCodes.F,
            strike:   Phaser.Input.Keyboard.KeyCodes.W,
            breakOrb:   Phaser.Input.Keyboard.KeyCodes.T,
        });

        // ── Player ───────────────────────────────────────────────────────────
        this.player = this.physics.add.sprite(400, 450, 'char');
        this.player.setBounce(0.2);
        this.player.setScale(1.4);
        this.player.setCollideWorldBounds(true);
        this.player.body.setSize(40, 40);
        this.player.body.setOffset(80, 80);

        this.hasSecondSkill = true;
        this.playerDamageMultiplier = 1;
        this.inCombat          = false;
        this.isAttacking       = false;
        this.isCharging        = false; // S super-jump charge
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
        this.hasFireball          = true;
        this.fireballCooldown     = 0;
        this.fireballCooldownMax  = 2000;
        this.fireballs            = [];

        this.potions = [];
        this.enemies        = [];

        // ── Platforms (first area) ────────────────────────────────────────────
        this.platforms = this.physics.add.staticGroup();


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
        
        safe('boss_idle',   { key:'boss_idle',   frames: this.anims.generateFrameNumbers('boss_idle',   {start:0,end:3}),  frameRate:6,  repeat:-1 });
        safe('boss_idle2',  { key:'boss_idle2',  frames: this.anims.generateFrameNumbers('boss_idle2',  {start:0,end:7}),  frameRate:8,  repeat:-1 });
        safe('boss_attack', { key:'boss_attack', frames: this.anims.generateFrameNumbers('boss_attack', {start:0,end:12}), frameRate:12, repeat:0  });
        safe('boss_death',  { key:'boss_death',  frames: this.anims.generateFrameNumbers('boss_death',  {start:0,end:16}), frameRate:10, repeat:0  });
        safe('boss_skill1', { key:'boss_skill1', frames: this.anims.generateFrameNumbers('boss_skill1', {start:0,end:11}), frameRate:10, repeat:0  });
        safe('boss_summon', { key:'boss_summon', frames: this.anims.generateFrameNumbers('boss_summon', {start:0,end:4}),  frameRate:8,  repeat:0  });


        safe('altego_idle',   { key:'altego_idle',   frames: this.anims.generateFrameNumbers('altego_idle',   {start:0,end:3}), frameRate:8,  repeat:-1 });
        safe('altego_run',    { key:'altego_run',    frames: this.anims.generateFrameNumbers('altego_run',    {start:0,end:7}), frameRate:10, repeat:-1 });
        safe('altego_attack', { key:'altego_attack', frames: this.anims.generateFrameNumbers('altego_attack', {start:0,end:3}), frameRate:10, repeat:0  });
        safe('altego_death',  { key:'altego_death',  frames: this.anims.generateFrameNumbers('altego_death',  {start:0,end:6}), frameRate:10, repeat:0  });

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
       


        // ── judgement icon UI ──────────────────────────────────────────────────
        this.judgementIcon =  this.add.image(690, 90, 'skills', 27).setDepth(50);
        this.judgementIconOverlay = this.add.graphics().setScrollFactor(0).setDepth(21);
        this.judgementIcon.setScale(1.4);
        this.judgementIcon.setScrollFactor(0).setDepth(20);
        
        const makeSkillKeycap = (x, y, label, tint = '#ffffff') => {
            const bg = this.add.rectangle(x, y, 20, 16, 0x000000, 0.72)
                .setStrokeStyle(1, 0xffffff, 0.35)
                .setScrollFactor(0)
                .setDepth(22);
        
            const txt = this.add.text(x, y, label, {
                fontSize: '11px',
                fill: tint,
                stroke: '#000000',
                strokeThickness: 2,
                fontStyle: 'bold',
                fontFamily: 'monospace'
            }).setOrigin(0.5).setScrollFactor(0).setDepth(23);
        
            return { bg, txt };
        };
        
        this.judgementKeycap = makeSkillKeycap(this.judgementIcon.x, this.judgementIcon.y + 24, 'W', '#f5e7a1');
        this.fireballKeycap = makeSkillKeycap(this.fireballIcon.x, this.fireballIcon.y + 24, 'F', '#ffb36b');

        // ── Camera / colliders ────────────────────────────────────────────────
        this.player.anims.play('idle');
       

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
            if (pointer.leftButtonDown() && !this.isAttacking && !this.gamePaused && !this.inMirrorRealm) {
                this.isAttacking = true;
                this.player.setVelocityX(0);
                this.player.anims.play('attack');
                this._tryHitEnemies();
            } else if (pointer.leftButtonDown() && !this.isAttacking && !this.gamePaused && this.inMirrorRealm) {
                // Mirror realm attack
                this.isAttacking = true;
                this.player.setVelocityX(0);
                this.player.anims.play('attack');
                this._tryHitAltEgo();
            }
        });
        this.player.on('animationcomplete', (anim) => {
            if (anim.key === 'attack') this.isAttacking = false;
        });

        //Boss spawn 
        this.boss = this.physics.add.sprite(400, 220, 'boss_idle'); // Floating above ground
        this.boss.setScale(2.5); // Scale up from 100x100
        this.boss.body.setAllowGravity(false);
        this.boss.body.setImmovable(true);
        this.boss.body.setSize(60, 80);
        this.boss.setDepth(10);
         // Boss HP system (segmented)
         this.bossPhase = 1;
       
         this.bossHpPerPhase = 1000;
         this.bossCurrentHp = this.bossHpPerPhase;
         this.bossInvulnerable = false;
 
         // Boss health bar (spanning screen at top)
         this._drawBossHealthBar();
 
         // Enemies array
         this.enemies = [];
 
         // Dialogue system
         this.dialogueText = null;
         this.dialogueQueue = [];
         this.isShowingDialogue = false;
 
         // Phase state
         this.currentPhase = 'intro';
         this.laserRound = 0;
         this.maxLaserRounds = 5;
         this.laserWarnings = [];
         this.hasSummoned = false;
         this.activeLasers = [];
 
         // Orb state
         this.soulOrb = null;
         this.orbPresses = 0;
         this.orbMaxPresses = 8;
         this.orbIsBroken = false;
       
       // Phase 4 state
        this.phase4Wave        = 0;   // 0 = not started, 1 = wave 1, 2 = wave 2
        this.phase4WaveDone    = false;
        this.phase4OrbBroken   = false;
        this.phase4LaserLoop   = null;
        this.phase4BossAtkLoop = null;
        // Mirror Realm state
        this.inMirrorRealm = false;
        this.altEgo = null;
        this.mirrorBackground = null;
        this.mirrorFloor = null;

         // Float animation for boss
         this.tweens.add({
             targets: this.boss,
             y: 220 + 15,
             duration: 2000,
             yoyo: true,
             repeat: -1,
             ease: 'Sine.easeInOut'
         });
 
         this.boss.anims.play('boss_idle', true);
 
       

        //WALLS
        this.leftWall = this.add.rectangle(5, 300, 10, 600, 0xffffff, 0);
        this.rightWall = this.add.rectangle(795, 300, 10, 600, 0xffffff, 0);
        
        this.physics.add.existing(this.leftWall, true);
        this.physics.add.existing(this.rightWall, true);
        
        this.physics.add.collider(this.player, this.leftWall);
        this.physics.add.collider(this.player, this.rightWall);
        
        // Natural regen (disabled while judgement mini-game is active)
        this.time.addEvent({
            delay: 2500,
            loop: true,
            callback: () => {
                if (!this.inCombat && !this._jHealBlocked && this.playerHealth < this.playerMaxHealth && !this.gamePaused) {
                    this.playerHealth = Math.min(this.playerMaxHealth, this.playerHealth + 10);
                    this._drawPlayerHpBar();
                    this._playHealEffect(); // ← add this
                }
            }
        });

        // Strike of Judgement setup
        this._initJudgement();
        // Start intro
        this.time.delayedCall(800, () => this._startIntro());
    }
    _showDialogue(text, duration = 3000) {
        if (this.isShowingDialogue) {
            this.dialogueQueue.push({ text, duration });
            return;
        }
    
        this.isShowingDialogue = true;
    
        if (this.dialogueBox) this.dialogueBox.destroy();
        if (this.nameText) this.nameText.destroy();
        if (this.dialogueText) this.dialogueText.destroy();
    
        const boxX = 400;
        const boxY = 100;
        const boxWidth = 760;
        const boxHeight = 110;
        const padding = 20;
    
        this.dialogueBox = this.add.rectangle(boxX, boxY, boxWidth, boxHeight, 0x000000, 0.85)
            .setOrigin(0.5)
            .setStrokeStyle(2, 0x888888)
            .setDepth(29)
            .setAlpha(0);
    
        this.nameText = this.add.text(boxX - boxWidth / 2 + padding, boxY - 35, 'Grim Reaper', {
            fontSize: '22px',
            fill: '#ff4444',
            fontStyle: 'bold'
        })
        .setDepth(30)
        .setAlpha(0);
    
        this.dialogueText = this.add.text(boxX - boxWidth / 2 + padding, boxY - 5, '', {
            fontSize: '20px',
            fill: '#ffffff',
            wordWrap: { width: boxWidth - padding * 2 }
        })
        .setDepth(30)
        .setAlpha(0);
    
        this.tweens.add({
            targets: [this.dialogueBox, this.nameText, this.dialogueText],
            alpha: 1,
            duration: 200
        });
    
        let charIndex = 0;
        this.time.addEvent({
            delay: 50,
            repeat: text.length - 1,
            callback: () => {
                this.dialogueText.setText(text.substring(0, charIndex + 1));
                charIndex++;
            }
        });
    
        this.time.delayedCall(text.length * 50 + duration, () => {
            this.tweens.add({
                targets: [this.dialogueBox, this.nameText, this.dialogueText],
                alpha: 0,
                duration: 400,
                onComplete: () => {
                    if (this.dialogueBox) this.dialogueBox.destroy();
                    if (this.nameText) this.nameText.destroy();
                    if (this.dialogueText) this.dialogueText.destroy();
    
                    this.dialogueBox = null;
                    this.nameText = null;
                    this.dialogueText = null;
                    this.isShowingDialogue = false;
    
                    if (this.dialogueQueue.length > 0) {
                        const next = this.dialogueQueue.shift();
                        this._showDialogue(next.text, next.duration);
                    }
                }
            });
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Boss Health Bar
    // ─────────────────────────────────────────────────────────────────────────
    _drawBossHealthBar() {
        if (!this.bossHpGraphics) {
            this.bossHpGraphics = this.add.graphics().setScrollFactor(0).setDepth(29);
        }
    
        this.bossHpGraphics.clear();
    
        const barWidth = 760;
        const barHeight = 24;
        const barX = 20;
        const barY = 120;
    
        // Clamp ratio so it never goes below 0 or above 1
        const ratio = Phaser.Math.Clamp(this.bossCurrentHp / this.bossHpPerPhase, 0, 1);
        const fillWidth = barWidth * ratio;
    
        // Outer glow
        this.bossHpGraphics.fillStyle(0x330011, 0.6);
        this.bossHpGraphics.fillRect(barX - 4, barY - 4, barWidth + 8, barHeight + 8);
    
        // Background
        this.bossHpGraphics.fillStyle(0x1a0a0f, 1);
        this.bossHpGraphics.fillRect(barX, barY, barWidth, barHeight);
    
        // Main HP fill based only on currentHp / maxHpPerPhase
        this.bossHpGraphics.fillStyle(0x8b0000, 1);
        this.bossHpGraphics.fillRect(barX, barY, fillWidth, barHeight);
    
        // Highlight
        this.bossHpGraphics.fillStyle(0xff3333, 0.6);
        this.bossHpGraphics.fillRect(barX, barY + 2, fillWidth, 6);
    
        // Border
        this.bossHpGraphics.lineStyle(3, 0x660000, 1);
        this.bossHpGraphics.strokeRect(barX, barY, barWidth, barHeight);
        this.bossHpGraphics.lineStyle(1, 0xff0000, 0.5);
        this.bossHpGraphics.strokeRect(barX + 1, barY + 1, barWidth - 2, barHeight - 2);
    
        // Boss name
        if (!this.bossNameText) {
            this.bossNameText = this.add.text(400, barY - 12, 'THE GRIM REAPER', {
                fontSize: '16px',
                fill: '#ff3333',
                stroke: '#000000',
                strokeThickness: 4,
                fontStyle: 'bold',
                fontFamily: 'serif'
            }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(29);
        }
    }

    _damageBoss(amount) {
        if (this.bossInvulnerable) return;

        this.bossCurrentHp = Math.max(0, this.bossCurrentHp - amount);
        this._drawBossHealthBar();

        // Flash boss
        this.boss.setTintFill(0xffffff);
        this.time.delayedCall(150, () => {
            if (this.boss.active) this.boss.clearTint();
        });

        this.cameras.main.shake(200, 0.008);

        if (this.bossCurrentHp <= 0) {
            this._endCurrentPhase();
        }
    }

    _endCurrentPhase() {
        this.bossInvulnerable = true;
        
       

        // Advance phase
        this.bossPhase++;
        this.bossCurrentHp = this.bossHpPerPhase;
        this._drawBossHealthBar();

        // Next phase based on current phase
        if (this.bossPhase === 2) {
            this.time.delayedCall(1000, () => this._startPhase2());
        }
        if(this.bossPhase  === 3) {
            this.time.delayedCall(500, () => this._startPhase3());
        }
        if(this.bossPhase === 4) {
            this.time.delayedCall(500, () => this._startPhase4());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase System
    // ─────────────────────────────────────────────────────────────────────────
    _startIntro() {
       
       

        this._showDialogue('You imbecile, You should\'ve ran away.', 2500);

        this.time.delayedCall(4000, () => {
            this.gamePaused = false;
            this._startPhase1();
        });
    }
    _startPhase1() {
            this.currentPhase = 'laser';
            this.laserRound = 0;
            this.bossInvulnerable = true;
    
            this._showDialogue('Now Die.', 1200);
    
            this.time.delayedCall(2500, () => this._startLaserRound());
        }
    
        _startLaserRound() {
            this.laserRound++;
    
            if (this.laserRound > this.maxLaserRounds) {
                // Phase complete
                this._showDialogue('Impressive. But futile.', 2500);
               
                this.time.delayedCall(2200, () => {
                    this.bossInvulnerable=false;
                   
                    this._damageBoss(this.bossHpPerPhase); // End phase 1
                });
                return;
            }
    
            // Difficulty scaling
            const baseCount = 3;
            const additionalPerRound = 2;
            const laserCount = baseCount + (this.laserRound - 1) * additionalPerRound;
            
            const baseDelay = 1800;
            const delayReduction = (this.laserRound - 1) * 200;
            const telegraphTime = Math.max(1000, baseDelay - delayReduction);
    
            // Boss taunt
             if (this.laserRound === 2) this._showDialogue('Run like the ant you are.', 2200);
    
            // Create laser warnings
            for (let i = 0; i < laserCount; i++) {
                this.time.delayedCall(i * 300, () => {
                    this._spawnLaserWarning(telegraphTime);
                });
            }
    
            // Next round after all lasers finish
            const totalTime = (laserCount * 300) + telegraphTime + 800;
            this.time.delayedCall(totalTime, () => this._startLaserRound());
        }
    
        _spawnLaserWarning(telegraphTime) {
            // Semi-random position around player
            const playerX = this.player.x;
            const offsetX = Phaser.Math.Between(-180, 180);
            const targetX = Phaser.Math.Clamp(playerX + offsetX, 80, 720);
    
            const laserWidth = 60; // THICK lasers as requested
            
            // Warning zone
            const warning = this.add.graphics().setDepth(5);
            warning.fillStyle(0x8800ff, 0.25);
            warning.fillRect(targetX - laserWidth/2, 0, laserWidth, 600);
            
            // Pulsing animation
            this.tweens.add({
                targets: warning,
                alpha: 0.6,
                duration: 400,
                yoyo: true,
                repeat: Math.floor(telegraphTime / 800)
            });
    
            this.laserWarnings.push(warning);
    
            // Strike laser
            this.time.delayedCall(telegraphTime, () => {
                warning.destroy();
                this._strikeLaser(targetX, laserWidth);
            });
        }
    
        _strikeLaser(x, width) {
            // Purple laser beam
            const laser = this.add.graphics().setDepth(15);
            laser.fillStyle(0xaa00ff, 0.9);
            laser.fillRect(x - width/2, 0, width, 600);
            
            // Outer glow
            laser.fillStyle(0xff00ff, 0.4);
            laser.fillRect(x - width/2 - 10, 0, width + 20, 600);
    
            this.activeLasers.push(laser);
    
            // Screen shake
            this.cameras.main.shake(300, 0.015);
    
            // Impact particles
            for (let py = 100; py < 600; py += 80) {
                const burst = this.add.particles(x, py, 'particle', {
                    speed: { min: 80, max: 150 },
                    angle: { min: 160, max: 200 },
                    scale: { start: 1.2, end: 0 },
                    blendMode: 'ADD',
                    lifespan: 400,
                    tint: [0xaa00ff, 0xff00ff, 0xffffff],
                    quantity: 6,
                    emitting: false
                }).setDepth(14);
                burst.explode(6);
                this.time.delayedCall(500, () => { if (burst.active) burst.destroy(); });
            }
    
            // Check player hit
            const playerHit = Math.abs(this.player.x - x) < (width / 2 + 20);
            if (playerHit && !this.playerInvincible) {
                this._enemyHitPlayer(80);
            }
    
            // Remove laser
            this.time.delayedCall(300, () => {
                laser.destroy();
                this.activeLasers = this.activeLasers.filter(l => l !== laser);
            });
        }
    

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 2: SUMMON + ORB BREAK
    // ════════════════════════════════════════════════════════════════════════
    _startPhase2() {
        this.currentPhase = 'summon';
        this.bossInvulnerable = true;

        this._showDialogue('Come forth, my children.', 2000);

        this.time.delayedCall(3500, () => {
            this.boss.anims.play('boss_summon', true);
            
            // Summon VFX
            this.cameras.main.shake(1200, 0.012);
            
            // Ground rumble particles
            for (let i = 0; i < 12; i++) {
                const px = Phaser.Math.Between(100, 700);
                this.time.delayedCall(i * 100, () => {
                    const groundBurst = this.add.particles(px, FLOOR_Y + 20, 'particle', {
                        speed: { min: 40, max: 100 },
                        angle: { min: 240, max: 300 },
                        scale: { start: 1.5, end: 0 },
                        blendMode: 'ADD',
                        lifespan: 800,
                        gravityY: -120,
                        tint: [0x440044, 0x880088, 0xaa00aa],
                        quantity: 8,
                        emitting: false
                    }).setDepth(12);
                    groundBurst.explode(8);
                    this.time.delayedCall(1000, () => { if (groundBurst.active) groundBurst.destroy(); });
                });
            }

            this.time.delayedCall(1500, () => {
                this._summonEnemies();
                this.boss.anims.play('boss_idle2', true);
            });
        });
    }

    _summonEnemies() {

        this._showDialogue('Kill that fool.', 3000);


             const flyPositions = [
                { x: 500, y: 220  },
                { x: 400, y: 260  },
                { x: 300, y: 240  },
                { x: 550, y: 280  },
                { x: 450, y: 200  },
                { x: 350, y: 220  },
            ];
            flyPositions.forEach(pos => {
                this.enemies.push(this._spawnEnemy('flyeye', pos.x, pos.y));
            });
        
            const landPositions = [
                { type: 'goblin',   x: 550, y: FLOOR_Y - 60 },
                { type: 'skeleton', x: 650, y: FLOOR_Y - 60 },
                 { type: 'goblin',   x: 150, y: FLOOR_Y - 60 },
                { type: 'skeleton', x: 250, y: FLOOR_Y - 60 },
                { type: 'goblin',   x: 175, y: FLOOR_Y - 60 },
                { type: 'skeleton', x: 210, y: FLOOR_Y - 60 },
            ];
        
            landPositions.forEach(pos => {
                const e = new Enemy(this, pos.x, pos.y, pos.type);
                this.physics.add.collider(e.sprite, this._floor);
                this.physics.add.collider(e.sprite, this.platforms);
                this.enemies.push(e);
            });
            this.hasSummoned=true;
    }

    _checkSummonPhaseComplete() {
        const allDead = this.enemies.every(e => e.dead);
        if (allDead && this.currentPhase === 'summon' && !this.soulOrb && this.hasSummoned && !this.orbIsBroken) {
            this.time.delayedCall(1000, () => this._spawnSoulOrb());
        }
    }

    _spawnSoulOrb() {
        const orbX = 400;
        const orbY = 390;
    
        this.soulOrbX = orbX;
        this.soulOrbY = orbY;
        this.orbPresses = 0;
        this.orbMaxPresses = 8;
        this.cameras.main.shake(70, 0.025);
        if (this.soulOrb) this.soulOrb.destroy();
        if (this.orbPrompt) this.orbPrompt.destroy();
    
        this.soulOrb = this.add.sprite(orbX, orbY, 'orb')
            .setScale(0.4)
            .setDepth(20);
    
        this.orbPrompt = this.add.text(orbX, orbY - 48, 'Press T repeatedly\n0 / 8', {
            fontSize: '18px',
            color: '#e9dcff',
            stroke: '#14071f',
            strokeThickness: 4,
            align: 'center',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(21);
    
        this.isBreakingOrb = false;
    }
    
    _tryBreakOrb() {
        if (!this.soulOrb || !this.player || this.isBreakingOrb) return;
    
        const dist = Phaser.Math.Distance.Between(
            this.player.x,
            this.player.y,
            this.soulOrb.x,
            this.soulOrb.y
        );
    
        if (dist > 92) return;
    
        this.orbPresses++;
        this.orbPrompt.setText(`Press T repeatedly\n${this.orbPresses} / ${this.orbMaxPresses}`);
    
        this.cameras.main.shake(70, 0.01);
    
        this.tweens.killTweensOf(this.soulOrb);
        this.soulOrb.setScale(0.4);
    
        this.tweens.add({
            targets: this.soulOrb,
            scaleX: 0.46,
            scaleY: 0.36,
            duration: 80,
            yoyo: true,
            ease: 'Quad.out'
        });
    
        if (this.orbPresses >= this.orbMaxPresses) {
            this._breakOrb();
        }
    }
    

    _breakOrb() {
        if (!this.soulOrb || this.isBreakingOrb) return;
    
        // Phase 4 final orb kills the boss
        if (this.currentPhase === 'phase4') {
            this._breakPhase4Orb();
            return;
        }
    
        this.isBreakingOrb = true;
    
        this.tweens.killTweensOf(this.soulOrb);
        this.soulOrb.setScale(0.4);
    
        this.cameras.main.shake(300, 0.045);
        this.cameras.main.flash(200, 210, 190, 255);
    
        if (this.textures.exists('particle')) {
            const explosion = this.add.particles(this.soulOrb.x, this.soulOrb.y, 'particle', {
                speed: { min: 80, max: 180 },
                angle: { min: 0, max: 360 },
                scale: { start: 1.2, end: 0 },
                blendMode: 'ADD',
                lifespan: 500,
                tint: [0xb784ff, 0xf3eaff, 0xffffff],
                quantity: 18,
                emitting: false
            }).setDepth(22);
    
            explosion.explode(18);
    
            this.time.delayedCall(600, () => {
                if (explosion && explosion.active) explosion.destroy();
            });
        }
    
        this.tweens.add({
            targets: this.soulOrb,
            scaleX: 0.55,
            scaleY: 0.55,
            alpha: 0,
            duration: 180,
            ease: 'Quad.out',
            onComplete: () => {
                if (this.soulOrb) this.soulOrb.destroy();
                if (this.orbPrompt) this.orbPrompt.destroy();
    
                this.soulOrb = null;
                this.orbPrompt = null;
                this.isBreakingOrb = false;
                this.orbIsBroken = true;
                this._showDialogue('NO! DAMN YOU', 2000);
    
                this.time.delayedCall(800, () => {
                    this.bossInvulnerable=false;
                    this._damageBoss(this.bossHpPerPhase); // End phase 1
                });
                return;
            }
        });
    }
    _startPhase3() {
        this.bossInvulnerable=true;
        this._showDialogue('You dare defy me?!', 2200);
 
        this.time.delayedCall(3000, () => {
            this.boss.anims.play('boss_skill1', true); // Mirror world ability
 
            this._showDialogue('Face yourself... in the void!', 3000);
 
            // Flashbang effect
            this.time.delayedCall(1200, () => {
                this.cameras.main.flash(800, 255, 255, 255, true);
                
                this.time.delayedCall(400, () => {
                    this._enterMirrorRealm();
                });
            });
        });
    }
    _enterMirrorRealm() {
        this.inMirrorRealm = true;
        this.gamePaused = false;
        this.playerHealth = Math.max(this.playerMaxHealth * 0.70,this.playerHealth);
        // Hide normal world
        this.bg.setVisible(false);
        this.boss.setVisible(false);
        this.bossHpGraphics.setVisible(false);
        this.bossNameText.setVisible(false);
 
        // Show mirror background
        this.mirrorBackground = this.add.image(400, 300, 'mirror_bg').setDepth(0);
        this.mirrorBackground.setDepth(0);
        this._floor.setDepth(5);
        this.player.setDepth(10);

        // Black box appears on opposite side of player
        const boxSide = this.player.x < 400 ? 1 : -1;
        const boxX = boxSide > 0 ? 650 : 150;
 
        const blackBox = this.add.rectangle(boxX, 300, 100, 100, 0x000000).setDepth(45);
 
        // Reverse death animation (7 frames)
        this.time.delayedCall(400, () => {
            blackBox.destroy();
 
            // Alt ego spawns
            this.altEgo = new AltEgo(this, boxX, FLOOR_Y - 60);
            this.physics.add.collider(this.altEgo.sprite, this._floor);
 
            // Playreverse death animation
            const frames = [];
            for (let i = 6; i >= 0; i--) {
                frames.push(i);
            }
 
            // Create temporary reverse animation
            if (!this.anims.exists('altego_spawn')) {
                this.anims.create({
                    key: 'altego_spawn',
                    frames: frames.map(f => ({ key: 'altego_death', frame: f })),
                    frameRate: 12,
                    repeat: 0
                });
            }
 
            this.altEgo.sprite.anims.play('altego_spawn', true);
            
            this.altEgo.sprite.once('animationcomplete', () => {
                this.altEgo.sprite.anims.play('altego_idle', true);
            });
        });
 
        // Update camera bounds for mirror realm
        this.cameras.main.setBounds(0, 0, 800, 600);
    }
 
    _tryHitAltEgo() {
        if (!this.altEgo || this.altEgo.dead) return;
 
        const dist = Phaser.Math.Distance.Between(
            this.player.x, this.player.y,
            this.altEgo.sprite.x, this.altEgo.sprite.y
        );
 
        if (dist < 130) {
            const playerDir = this.player.flipX ? -1 : 1;
            const baseDmg = Phaser.Math.Between(19, 25);
            const dmg = Math.floor(baseDmg * this.playerDamageMultiplier);
            
            const killed = this.altEgo.takeDamage(dmg, playerDir);
            this.cameras.main.shake(60, 0.004);
 
            if (killed) {
                this.time.delayedCall(1500, () => this._mirrorVictory());
            }
        }
    }
 
    _mirrorVictory() {
       
 
        // Full heal animation
        const healBurst = this.add.particles(this.player.x, this.player.y - 20, 'particle', {
            speed: { min: 60, max: 150 },
            angle: { min: 0, max: 360 },
            scale: { start: 2, end: 0 },
            blendMode: 'ADD',
            lifespan: 1000,
            gravityY: -100,
            quantity: 50,
            tint: [0x44ff88, 0x00ff55, 0xffffff, 0xaaffcc],
            emitting: false
        }).setDepth(50);
        healBurst.explode(50);
 
        const healText = this.add.text(this.player.x, this.player.y - 80, 'FULL HEAL!', {
            fontSize: '32px',
            fill: '#44ff88',
            stroke: '#000000',
            strokeThickness: 6,
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(51);
 
        this.tweens.add({
            targets: healText,
            y: healText.y - 60,
            alpha: 0,
            duration: 2000,
            ease: 'Cubic.easeOut',
            onComplete: () => healText.destroy()
        });
 
        this.playerHealth = this.playerMaxHealth;
        this._drawPlayerHpBar();
 
        this.time.delayedCall(1200, () => {
            if (healBurst.active) healBurst.destroy();
            this._grantStrengthBuff();
        });
    }
 
    _grantStrengthBuff() {
        // Strength buff animation
        this.playerStrengthBuff = true;
        this.playerDamageMultiplier = 1.85;
 
        const buffBurst = this.add.particles(this.player.x, this.player.y, 'particle', {
            speed: { min: 40, max: 100 },
            angle: { min: 0, max: 360 },
            scale: { start: 1.5, end: 0 },
            blendMode: 'ADD',
            lifespan: 800,
            tint: [0xff4400, 0xff8800, 0xffaa00],
            quantity: 40,
            emitting: false
        }).setDepth(50);
        buffBurst.explode(40);
 
        const buffText = this.add.text(this.player.x, this.player.y - 80, 'STRENGTH UP!', {
            fontSize: '32px',
            fill: '#ff8800',
            stroke: '#000000',
            strokeThickness: 6,
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(51);
 
        this.tweens.add({
            targets: buffText,
            y: buffText.y - 60,
            alpha: 0,
            duration: 2000,
            ease: 'Cubic.easeOut',
            onComplete: () => buffText.destroy()
        });
 
        // Permanent glow on player
        this.player.setTint(0xffaa44);
 
        this.time.delayedCall(1200, () => {
            if (buffBurst.active) buffBurst.destroy();
            this._shatterMirror();
        });
    }
 
    _shatterMirror() {
        // Mirror shatter effect
        this.cameras.main.shake(800, 0.02);
 
        // Create shatter shards
        for (let i = 0; i < 20; i++) {
            const shard = this.add.graphics().setDepth(52);
            shard.fillStyle(0xccffff, 0.6);
            shard.fillTriangle(0, 0, 20, 10, 10, 25);
            
            const startX = Phaser.Math.Between(100, 700);
            const startY = Phaser.Math.Between(50, 550);
            shard.setPosition(startX, startY);
            
            this.tweens.add({
                targets: shard,
                x: startX + Phaser.Math.Between(-200, 200),
                y: startY + Phaser.Math.Between(100, 400),
                angle: Phaser.Math.Between(-360, 360),
                alpha: 0,
                duration: 1200,
                ease: 'Cubic.easeOut',
                onComplete: () => shard.destroy()
            });
        }
 
        // Flash white
        this.cameras.main.flash(1000, 255, 255, 255, true);
 
        this.time.delayedCall(200, () => {
            this._exitMirrorRealm();
        });
    }
 
    _exitMirrorRealm() {
        this.inMirrorRealm = false;
 
        // Remove mirror assets
        if (this.mirrorBackground) this.mirrorBackground.destroy();
        if (this.altEgo && this.altEgo.sprite?.active) {
            this.altEgo.sprite.destroy();
        }
 
        // Restore normal world
        this.bg.setVisible(true);
        this.boss.setVisible(true);
        this.bossHpGraphics.setVisible(true);
        this.bossNameText.setVisible(true);
 
        // Boss gets MORE angry
        this._showDialogue('Impossible!!', 2100);
 
        this.time.delayedCall(1000, () => {
            this._showDialogue('I will OBLITERATE you!', 2500);
            
            this.time.delayedCall(1200, () => {
                this.bossInvulnerable= false;
                this._damageBoss(this.bossHpPerPhase);
            });
        });
    }
// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4 — THE FINAL STAND
// Wave 1: 16 enemies | Boss attacks during wave | Lasers throughout
// Wave 2: 19 enemies | Boss attacks during wave | Lasers throughout
// Total P4 enemies: 35  |  Total fight: P2(5) + P4(35) = 40
// Orb break after Wave 2 = boss dies
// ═══════════════════════════════════════════════════════════════════════════

_startPhase4() {
    this.currentPhase     = 'phase4';
    this.bossInvulnerable = true;
    this.phase4Wave       = 0;
    this.phase4WaveDone   = false;
    this.phase4OrbBroken  = false;

    // Clean up any lingering enemies
    this.enemies.forEach(e => { if (!e.dead) e.die(); });
    this.enemies = [];

  
        this.boss.anims.play('boss_summon', true);
        this._showDialogue('Come forth — ALL of you!', 2500);
        this.cameras.main.shake(2000, 0.022);

        for (let i = 0; i < 20; i++) {
            this.time.delayedCall(i * 90, () => {
                const px = Phaser.Math.Between(80, 720);
                const burst = this.add.particles(px, FLOOR_Y + 20, 'particle', {
                    speed: { min: 50, max: 140 },
                    angle: { min: 240, max: 300 },
                    scale: { start: 2.0, end: 0 },
                    blendMode: 'ADD',
                    lifespan: 900,
                    gravityY: -120,
                    tint: [0x330033, 0x880088, 0xcc00cc],
                    quantity: 12,
                    emitting: false
                }).setDepth(12);
                burst.explode(12);
                this.time.delayedCall(1000, () => { if (burst.active) burst.destroy(); });
            });
        }

        this.time.delayedCall(2000, () => {
            this.boss.anims.play('boss_idle2', true);
            this._spawnPhase4Wave(1);
            this._startPhase4Lasers();
            this._startPhase4BossAttacks();
        });
    ;
}

_spawnPhase4Wave(waveNum) {
    this.phase4Wave = waveNum;
    this.phase4WaveDone = false;

    // keep only valid living refs
    this.enemies = this.enemies.filter(e => e && !e.dead);

    // reset wave 2 controls
    this.phase4Wave2Queue = [];
    this.phase4Wave2ActiveCap = 10;
    this.phase4Wave2SpawnPending = false;

    if (waveNum === 1) {
        this._showDialogue('Kill that miserable fool!', 2500);

        const flyPos = [
            { x: 500, y: 200 }, { x: 400, y: 230 }, { x: 300, y: 210 },
            { x: 600, y: 185 }, { x: 450, y: 255 }, { x: 250, y: 220 },
        ];
        flyPos.forEach(p => this._spawnEnemy('flyeye', p.x, p.y));

        const groundPos = [
            { type: 'goblin',   x: 620, y: FLOOR_Y - 60 },
            { type: 'skeleton', x: 680, y: FLOOR_Y - 60 },
            { type: 'goblin',   x: 100, y: FLOOR_Y - 60 },
            { type: 'skeleton', x: 170, y: FLOOR_Y - 60 },
            { type: 'goblin',   x: 720, y: FLOOR_Y - 60 },
            { type: 'skeleton', x:  60, y: FLOOR_Y - 60 },
            { type: 'goblin',   x: 500, y: FLOOR_Y - 60 },
            { type: 'skeleton', x: 300, y: FLOOR_Y - 60 },
            { type: 'goblin',   x: 400, y: FLOOR_Y - 60 },
            { type: 'skeleton', x: 200, y: FLOOR_Y - 60 },
        ];
        groundPos.forEach(p => this._spawnEnemy(p.type, p.x, p.y));

        this.time.delayedCall(7000, () => {
            if (this.phase4Wave === 1) this._showDialogue('Is that all you have?!', 2000);
        });

    } else if (waveNum === 2) {
        this._showDialogue('YOU INSIGNIFICANT FUCK! I WILL GRIND YOU DOWN UNTIL THE VERY SPARKS CRY FOR MERCY.', 4000);
        this._showDialogue('MY HANDS SHALL RELISH ENDING YOU HERE AND NOW.', 2300);

        const allWave2 = [
            { type: 'flyeye',   x: 500, y: 195 },
            { type: 'flyeye',   x: 400, y: 225 },
            { type: 'flyeye',   x: 300, y: 210 },
            { type: 'flyeye',   x: 600, y: 180 },
            { type: 'flyeye',   x: 450, y: 250 },
            { type: 'flyeye',   x: 250, y: 215 },
            { type: 'flyeye',   x: 650, y: 200 },

            { type: 'goblin',   x: 640, y: FLOOR_Y - 60 },
            { type: 'skeleton', x: 700, y: FLOOR_Y - 60 },
            { type: 'goblin',   x:  80, y: FLOOR_Y - 60 },

            { type: 'skeleton', x: 150, y: FLOOR_Y - 60 },
            { type: 'goblin',   x: 740, y: FLOOR_Y - 60 },
            { type: 'skeleton', x:  40, y: FLOOR_Y - 60 },
            { type: 'goblin',   x: 520, y: FLOOR_Y - 60 },
            { type: 'skeleton', x: 280, y: FLOOR_Y - 60 },
            { type: 'goblin',   x: 380, y: FLOOR_Y - 60 },
            { type: 'skeleton', x: 460, y: FLOOR_Y - 60 },
            { type: 'goblin',   x: 600, y: FLOOR_Y - 60 },
            { type: 'skeleton', x: 120, y: FLOOR_Y - 60 },
        ];

        const initialBatch = allWave2.slice(0, 10);
        this.phase4Wave2Queue = allWave2.slice(10);

        initialBatch.forEach(p => this._spawnEnemy(p.type, p.x, p.y));

    
    }
}
_refillPhase4Wave2() {
    if (this.phase4Wave !== 2 || this.phase4WaveDone) return;
    if (!this.phase4Wave2Queue || this.phase4Wave2Queue.length === 0) return;
    if (this.phase4Wave2SpawnPending) return;

    const aliveCount = this.enemies.filter(e => e && !e.dead).length;

    if (aliveCount >= this.phase4Wave2ActiveCap) return;

    this.phase4Wave2SpawnPending = true;

    this.time.delayedCall(450, () => {
        this.phase4Wave2SpawnPending = false;

        if (this.phase4Wave !== 2 || this.phase4WaveDone) return;
        if (!this.phase4Wave2Queue || this.phase4Wave2Queue.length === 0) return;

        const aliveNow = this.enemies.filter(e => e && !e.dead).length;
        if (aliveNow >= this.phase4Wave2ActiveCap) return;

        const next = this.phase4Wave2Queue.shift();
        this._spawnEnemy(next.type, next.x, next.y);
    });
}
_checkPhase4WaveComplete() {
    if (this.phase4WaveDone) return;
    if (this.phase4Wave === 0) return;

    // Clean dead refs first
    this.enemies = this.enemies.filter(e => e && e.sprite && e.sprite.active && !e.dead);

    if (this.phase4Wave === 1) {
        const aliveCount = this.enemies.length;
        if (aliveCount > 0) return;

        this.phase4WaveDone = true;

        this._showDialogue('More... SEND MORE!', 2000);

        this.time.delayedCall(1000, () => {
            if (this.phase4WaveDone) {
                this.boss.anims.play('boss_summon', true);
                this.cameras.main.shake(1200, 0.016);
            }
        });

        this.time.delayedCall(1800, () => {
            if (this.phase4WaveDone) {
                this.boss.anims.play('boss_idle2', true);
                this._spawnPhase4Wave(2);
            }
        });

        return;
    }

    if (this.phase4Wave === 2) {
        const aliveCount = this.enemies.length;
        const queueRemaining = this.phase4Wave2Queue ? this.phase4Wave2Queue.length : 0;

        // If queue still has enemies, keep refilling back toward the cap
        if (queueRemaining > 0) {
            this._refillPhase4Wave2();
        }

        // End only when no living enemies AND queue empty
        if (aliveCount > 0 || queueRemaining > 0) return;

        this.phase4WaveDone = true;

        this._stopPhase4Loops();
        this.boss.anims.play('boss_idle2', true);
        this._showDialogue('No... NO! How?!', 2000);

        this.time.delayedCall(1900, () => {
            if (this.phase4WaveDone) {
                this._spawnPhase4Orb();
            }
        });
    }
}
// ── LASERS ────────────────────────────────────────────────────────────────

_startPhase4Lasers() {
    if (this.phase4LaserLoop) return;

    const fireBurst = () => {
        if (this.currentPhase !== 'phase4' || this.phase4OrbBroken) {
            this.phase4LaserLoop = null;
            return;
        }
        const count = this.phase4Wave === 2
            ? Phaser.Math.Between(3, 5)   // wave 2 is heavier
            : Phaser.Math.Between(2, 3);

        for (let i = 0; i < count; i++) {
            this.time.delayedCall(i * 320, () => {
                if (this.currentPhase !== 'phase4') return;
                this._spawnLaserWarning(950);
            });
        }
        const next = Phaser.Math.Between(4500, 7000);
        this.phase4LaserLoop = this.time.delayedCall(next + count * 320 + 950, fireBurst);
    };

    this.phase4LaserLoop = this.time.delayedCall(3000, fireBurst);
}

// ── BOSS DIRECT ATTACKS ───────────────────────────────────────────────────
// Boss fires a scythe-like projectile that flies across the arena

_startPhase4BossAttacks() {
    if (this.phase4BossAtkLoop) return;

    const doAttack = () => {
        if (this.currentPhase !== 'phase4' || this.phase4OrbBroken) {
            this.phase4BossAtkLoop = null;
            return;
        }

        this.boss.anims.play('boss_attack', true);
        this.boss.once('animationcomplete', () => {
            if (this.boss.active) this.boss.anims.play('boss_idle2', true);
        });

        // Fire 1–2 scythe projectiles toward player
        const numProj = this.phase4Wave === 2 ? 2 : 1;
        for (let i = 0; i < numProj; i++) {
            this.time.delayedCall(i * 350, () => {
                if (this.currentPhase !== 'phase4') return;
                this._fireScythe();
            });
        }

        const nextDelay = this.phase4Wave === 2
            ? Phaser.Math.Between(3500, 5500)
            : Phaser.Math.Between(5000, 8000);

        this.phase4BossAtkLoop = this.time.delayedCall(nextDelay, doAttack);
    };

    this.phase4BossAtkLoop = this.time.delayedCall(4000, doAttack);
}

_fireScythe() {
    if (!this.player || !this.boss) return;

    const startX = this.boss.x;
    const startY = this.boss.y + 10;
    const targetX = this.player.x;
    const targetY = this.player.y;

    const angle = Math.atan2(targetY - startY, targetX - startX);
    const speed = 360;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    // Warning flash at boss
    this.boss.setTint(0xff3300);
    this.time.delayedCall(150, () => { if (this.boss?.active) this.boss.clearTint(); });

    // Projectile as a graphics object
    const proj = this.add.graphics().setDepth(18);
    proj.fillStyle(0xcc00ff, 1);
    proj.fillCircle(0, 0, 9);
    proj.fillStyle(0xff44ff, 0.5);
    proj.fillCircle(0, 0, 14);
    proj.x = startX;
    proj.y = startY;

    // Trail
    const trail = this.add.particles(startX, startY, 'particle', {
        speed: { min: 10, max: 40 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.6, end: 0 },
        blendMode: 'ADD',
        lifespan: 250,
        tint: [0xcc00ff, 0xff00cc],
        quantity: 3,
        frequency: 30
    }).setDepth(17);

    // Move projectile manually via tween
    const travelTime = 1400;
    this.tweens.add({
        targets: proj,
        x: startX + vx * (travelTime / 1000),
        y: startY + vy * (travelTime / 1000),
        duration: travelTime,
        ease: 'Linear',
        onUpdate: () => {
            trail.setPosition(proj.x, proj.y);

            // Check player collision
            if (!this.playerInvincible && this.player?.active) {
                const d = Phaser.Math.Distance.Between(proj.x, proj.y, this.player.x, this.player.y);
                if (d < 28) {
                    this._enemyHitPlayer(45);
                    this._scytheImpact(proj.x, proj.y);
                    proj.destroy();
                    trail.destroy();
                }
            }
        },
        onComplete: () => {
            this._scytheImpact(proj.x, proj.y);
            if (proj.active)  proj.destroy();
            if (trail.active) trail.destroy();
        }
    });
}

_scytheImpact(x, y) {
    if (!this.textures.exists('particle')) return;
    const imp = this.add.particles(x, y, 'particle', {
        speed: { min: 60, max: 150 },
        angle: { min: 0, max: 360 },
        scale: { start: 1.0, end: 0 },
        blendMode: 'ADD',
        lifespan: 400,
        tint: [0xcc00ff, 0xff00ff, 0xffffff],
        quantity: 14,
        emitting: false
    }).setDepth(19);
    imp.explode(14);
    this.time.delayedCall(500, () => { if (imp.active) imp.destroy(); });
}

_stopPhase4Loops() {
    if (this.phase4LaserLoop) {
        this.phase4LaserLoop.remove(false);
        this.phase4LaserLoop = null;
    }
    if (this.phase4BossAtkLoop) {
        this.phase4BossAtkLoop.remove(false);
        this.phase4BossAtkLoop = null;
    }
}

// ── FINAL ORB ─────────────────────────────────────────────────────────────

_spawnPhase4Orb() {
    const orbX = 400, orbY = 390;
    this.soulOrbX = orbX; this.soulOrbY = orbY;
    this.orbPresses = 0; this.orbMaxPresses = 8;

    this.cameras.main.shake(150, 0.05);
    if (this.soulOrb)   this.soulOrb.destroy();
    if (this.orbPrompt) this.orbPrompt.destroy();

    this._showDialogue('No... you cannot have it! NOT THIS ONE!', 3000);

    for (let i = 0; i < 12; i++) {
        this.time.delayedCall(i * 70, () => {
            const b = this.add.particles(orbX, orbY, 'particle', {
                speed: { min: 70, max: 180 },
                angle: { min: 0, max: 360 },
                scale: { start: 1.6, end: 0 },
                blendMode: 'ADD',
                lifespan: 550,
                tint: [0xff2200, 0xff00cc, 0xffffff],
                quantity: 8, emitting: false
            }).setDepth(22);
            b.explode(8);
            this.time.delayedCall(650, () => { if (b.active) b.destroy(); });
        });
    }

    this.soulOrb = this.add.sprite(orbX, orbY, 'orb')
        .setScale(0.4).setDepth(20).setTint(0xff4444);

    this.orbPrompt = this.add.text(orbX, orbY - 48,
        'FINAL ORB — Press T!\n0 / 8', {
        fontSize: '18px', color: '#ffaaaa',
        stroke: '#14071f', strokeThickness: 4,
        align: 'center', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(21);

    this.isBreakingOrb = false;

    // Lasers keep firing during orb
    const orbLasers = () => {
        if (!this.soulOrb || this.phase4OrbBroken) return;
        const n = Phaser.Math.Between(2, 3);
        for (let i = 0; i < n; i++) {
            this.time.delayedCall(i * 380, () => {
                if (!this.soulOrb) return;
                this._spawnLaserWarning(780);
            });
        }
        this.time.delayedCall(n * 380 + 780 + Phaser.Math.Between(2000, 3500), orbLasers);
    };
    this.time.delayedCall(2800, orbLasers);

    // Boss still fires during orb
    const orbAtk = () => {
        if (!this.soulOrb || this.phase4OrbBroken) return;
        this._fireScythe();
        this.time.delayedCall(Phaser.Math.Between(3000, 5000), orbAtk);
    };
    this.time.delayedCall(3500, orbAtk);
}

_breakPhase4Orb() {
    if (!this.soulOrb || this.isBreakingOrb) return;
    this.isBreakingOrb   = true;
    this.phase4OrbBroken = true;
    this._stopPhase4Loops();

    this.tweens.killTweensOf(this.soulOrb);
    this.soulOrb.setScale(0.4);
    this.cameras.main.shake(700, 0.07);
    this.cameras.main.flash(350, 255, 180, 255);

    if (this.textures.exists('particle')) {
        const ex = this.add.particles(this.soulOrb.x, this.soulOrb.y, 'particle', {
            speed: { min: 100, max: 280 },
            angle: { min: 0, max: 360 },
            scale: { start: 2.0, end: 0 },
            blendMode: 'ADD',
            lifespan: 750,
            tint: [0xff2200, 0xff88ff, 0xffffff],
            quantity: 40, emitting: false
        }).setDepth(22);
        ex.explode(40);
        this.time.delayedCall(900, () => { if (ex.active) ex.destroy(); });
    }

    this.tweens.add({
        targets: this.soulOrb,
        scaleX: 0.7, scaleY: 0.7, alpha: 0,
        duration: 220, ease: 'Quad.out',
        onComplete: () => {
            if (this.soulOrb)   this.soulOrb.destroy();
            if (this.orbPrompt) this.orbPrompt.destroy();
            this.soulOrb = null; this.orbPrompt = null;
            this.isBreakingOrb = false;

            this.time.delayedCall(2400, () => {
                this._showDialogue('It can\'t be......', 3500);
            });
            this.time.delayedCall(5500, () => {
                this._bossFinalDeath();
            });
        }
    });
}

// ── FINAL DEATH + SCENE TRANSITION ───────────────────────────────────────

_bossFinalDeath() {
    this.bossInvulnerable = true;
    this.currentPhase = 'dead';
    this.gamePaused = true;

    // Stop action hard
    this._stopPhase4Loops?.();
    this.enemies.forEach(e => {
        if (e?.sprite?.active) e.sprite.setVelocity(0, 0);
    });

    // Freeze boss in place, no death anim
    if (this.boss?.body) {
        this.boss.body.setVelocity(0, 0);
        this.boss.body.enable = false;
    }

    this.cameras.main.shake(900, 0.02);
    this.cameras.main.flash(250, 255, 190, 255);

    // Small lingering dark bursts, not full death yet
    for (let i = 0; i < 6; i++) {
        this.time.delayedCall(i * 180, () => {
            const bx = this.boss.x + Phaser.Math.Between(-40, 40);
            const by = this.boss.y + Phaser.Math.Between(-35, 35);

            const burst = this.add.particles(bx, by, 'particle', {
                speed: { min: 40, max: 120 },
                angle: { min: 0, max: 360 },
                scale: { start: 1.2, end: 0 },
                blendMode: 'ADD',
                lifespan: 500,
                tint: [0x6600aa, 0xaa00ff, 0xffffff],
                quantity: 14,
                emitting: false
            }).setDepth(25);

            burst.explode(14);
            this.time.delayedCall(700, () => {
                if (burst.active) burst.destroy();
            });
        });
    }

    // Boss scream / denial only
    this.time.delayedCall(700, () => {
        this._showDialogue('VERONICAAAAAA!!', 2600);
    });

    // Let the moment breathe
    this.time.delayedCall(4200, () => {
        this.cameras.main.shake(1400, 0.032);

        // Boss starts fading, but no death animation
        this.tweens.add({
            targets: this.boss,
            alpha: 0.15,
            duration: 1800,
            ease: 'Sine.easeOut'
        });
    });

    // Transition later, with more space
    this.time.delayedCall(6500, () => {
        this._transitionToCutscene2();
    });
}

_transitionToCutscene2() {
    // Step 1: Massive camera shake + rumble
    this.cameras.main.shake(2500, 0.04);

    // Step 2: Darkness explosions crawling across the screen
    const screenW = 800, screenH = 600;
    const explosionPositions = [
        { x: 80,  y: 500, delay: 0    },
        { x: 720, y: 450, delay: 150  },
        { x: 400, y: 300, delay: 300  },
        { x: 150, y: 150, delay: 450  },
        { x: 650, y: 200, delay: 600  },
        { x: 260, y: 400, delay: 750  },
        { x: 540, y: 100, delay: 900  },
        { x: 350, y: 520, delay: 1050 },
        { x: 700, y: 350, delay: 1200 },
        { x: 100, y: 300, delay: 1350 },
        { x: 400, y: 150, delay: 1500 },
        { x: 600, y: 480, delay: 1650 },
    ];

    explosionPositions.forEach(({ x, y, delay }) => {
        this.time.delayedCall(delay, () => {
            // Dark void burst
            const dark = this.add.particles(x, y, 'particle', {
                speed: { min: 60, max: 200 },
                angle: { min: 0, max: 360 },
                scale: { start: 3.5, end: 0 },
                blendMode: 'MULTIPLY',
                lifespan: 900,
                tint: [0x000000, 0x110011, 0x220022],
                quantity: 30, emitting: false
            }).setDepth(55).setScrollFactor(0);
            dark.explode(30);
            this.time.delayedCall(950, () => { if (dark.active) dark.destroy(); });

            // Purple accent burst on top
            const accent = this.add.particles(x, y, 'particle', {
                speed: { min: 40, max: 160 },
                angle: { min: 0, max: 360 },
                scale: { start: 1.2, end: 0 },
                blendMode: 'ADD',
                lifespan: 600,
                tint: [0x6600cc, 0xcc00ff],
                quantity: 12, emitting: false
            }).setDepth(56).setScrollFactor(0);
            accent.explode(12);
            this.time.delayedCall(700, () => { if (accent.active) accent.destroy(); });

            // Small local shake per explosion
            this.cameras.main.shake(180, 0.018);
        });
    });

    // Step 3: Screen starts going black at 1800ms
    this.time.delayedCall(1800, () => {
        const blackOverlay = this.add.rectangle(400, 300, 800, 600, 0x000000, 0)
            .setDepth(60).setScrollFactor(0);

        this.tweens.add({
            targets: blackOverlay,
            alpha: 1,
            duration: 1400,
            ease: 'Cubic.easeIn'
        });
    });

    // Step 4: Maximum VIBRATION at 2500ms
    this.time.delayedCall(2500, () => {
        this.cameras.main.shake(1200, 0.065);
    });

    // Step 5: Final flash + scene switch at 3500ms
    this.time.delayedCall(3500, () => {
        this.cameras.main.flash(600, 255, 255, 255, true);
        this.time.delayedCall(600, () => {
            this.scene.start('Cutscene2');
        });
    });
}
    _spawnEnemy(type, x, y) {
        const e = new Enemy(this, x, y, type);
        if (type !== 'flyeye') {
            this.physics.add.collider(e.sprite, this._floor);
            this.physics.add.collider(e.sprite, this.platforms);

        }
        this.physics.add.collider(e.sprite, this.leftWall);
        this.physics.add.collider(e.sprite, this.rightWall);
        this.enemies.push(e);
       
        return e;
    }

    _dropPotion(x, y) {
       
        if (Math.random() > 0.35) return;
    
        const potion = this.physics.add.sprite(x, y - 20, 'potion');
        potion.setScale(0.1).setDepth(10);
        potion.setBounce(0.4);
        potion.setCollideWorldBounds(true);
        potion.healAmount = Phaser.Math.Between(60,80); // balanced: ~12% of max HP (500)
    
        // Gentle bob tween once it lands
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
    
        // Collide with floor and platforms
        this.physics.add.collider(potion, this._floor);
        this.physics.add.collider(potion, this.platforms);
    
        // Pickup overlap with player
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
        // Bigger burst than natural heal — it's an item pickup
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
    
        // Floating heal number
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
    
        // HP bar green pulse
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
        // Green particle burst off the player
        const healParticles = this.add.particles(this.player.x, this.player.y - 20, 'particle', {
            speed:     { min: 20, max: 55 },
            angle:     { min: 240, max: 300 },   // upward arc
            scale:     { start: 0.8, end: 0 },
            blendMode: 'ADD',
            lifespan:  700,
            gravityY:  -60,                       // float upward
            quantity:  8,
            tint:      [0x44ff88, 0x88ffaa, 0x00ff55],
            emitting:  false
        }).setDepth(12);
        healParticles.explode(8);
    
        // Floating +10 text
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
    
        // HP bar flash — brief white overlay tween on the bar graphic
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
                    const dmg = Phaser.Math.Between(19, 25) * this.playerDamageMultiplier;
                    e.takeDamage(dmg, playerDir, true);
                    this.cameras.main.shake(60, 0.004);
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
            this.jChargeDuration = 2500; // Reduced from 5000ms
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
          
            push(this.add.text(PX, PY - 140, 'Repeat the sequence. ', {
                fontSize: '12px', fill: '#d4c080', stroke: '#000000', strokeThickness: 2, align: 'center', wordWrap: { width: 360 }
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
          
               
            });
        }
    
        _launchFireball() {
            if (!this.hasFireball || this.fireballCooldown > 0 || this.gamePaused) return;
            this.fireballCooldown = this.fireballCooldownMax;
        
            const dir = this.player.flipX ? -1 : 1;
            const fb = this.physics.add.sprite(this.player.x + dir * 30, this.player.y - 10, 'flame');
            fb.setScale(0.6).setDepth(10);
            fb.body.setAllowGravity(false);
            fb.setVelocityX(dir * 520);
        
            this.fireballs.push(fb);
        
            this.tweens.add({
                targets: fb,
                angle: dir > 0 ? 360 : -360,
                duration: 600,
                repeat: -1
            });
        
            const DIRECT_DMG_MIN   = 20;
            const DIRECT_DMG_MAX   = 35;
            const SPLASH_RADIUS    = 120;
            const SPLASH_MIN_DIST  = 40;
            const SPLASH_DMG_PCT   = 0.55;
            const BURN_DURATION    = 5000;
            const BURN_DMG         = 8;
            const MAX_SPLASH_HITS  = 4; // cap extra enemies hit by splash
        
            let hit = false;
        
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
                scene.time.delayedCall(700, () => {
                    if (emitter.active) emitter.destroy();
                });
            };
        
            const _doSplash = (scene, ex, ey, directTarget) => {
                const candidates = [];
        
                scene.enemies.forEach(e => {
                    if (!e || e.dead || !e.sprite?.active) return;
                    if (e === directTarget) return;
        
                    const splashDist = Phaser.Math.Distance.Between(ex, ey, e.sprite.x, e.sprite.y);
                    if (splashDist > SPLASH_RADIUS) return;
        
                    candidates.push({ enemy: e, dist: splashDist });
                });
        
                // nearest enemies only
                candidates.sort((a, b) => a.dist - b.dist);
                const chosen = candidates.slice(0, MAX_SPLASH_HITS);
        
                chosen.forEach(({ enemy, dist }) => {
                    let falloff;
                    if (dist <= SPLASH_MIN_DIST) {
                        falloff = 1.0;
                    } else {
                        const t = (dist - SPLASH_MIN_DIST) / (SPLASH_RADIUS - SPLASH_MIN_DIST);
                        falloff = 1.0 - t * (1.0 - SPLASH_DMG_PCT);
                    }
        
                    const baseDmg = Phaser.Math.Between(DIRECT_DMG_MIN, DIRECT_DMG_MAX);
                    const splashDmg = Math.round(baseDmg * falloff);
        
                    enemy.takeDamage(splashDmg, dir, false);
                    enemy.applyBurn(BURN_DMG, BURN_DURATION);
                });
            };
        
            const checkHit = this.time.addEvent({
                delay: 16,
                loop: true,
                callback: () => {
                    if (!fb.active) {
                        checkHit.remove();
                        return;
                    }
        
                    // AltEgo: direct impact only, no splash, no burn
                    if (this.altEgo && !this.altEgo.dead && this.altEgo.sprite?.active) {
                        const altDist = Phaser.Math.Distance.Between(
                            fb.x, fb.y,
                            this.altEgo.sprite.x, this.altEgo.sprite.y
                        );
        
                        if (altDist < 45 && !hit) {
                            hit = true;
        
                            const dmg = Phaser.Math.Between(DIRECT_DMG_MIN, DIRECT_DMG_MAX);
                            this.altEgo.takeDamage(dmg, dir);
        
                            _explode(this, fb.x, fb.y);
        
                            fb.destroy();
                            checkHit.remove();
                            return;
                        }
                    }
        
                    // Normal enemies: direct hit + capped splash + burn
                    for (const e of this.enemies) {
                        if (!e || e.dead || !e.sprite?.active) continue;
        
                        const dist = Phaser.Math.Distance.Between(fb.x, fb.y, e.sprite.x, e.sprite.y);
        
                        if (dist < 45 && !hit) {
                            hit = true;
        
                            const dmg = Phaser.Math.Between(DIRECT_DMG_MIN, DIRECT_DMG_MAX);
                            e.takeDamage(dmg, dir, false);
                            e.applyBurn(BURN_DMG, BURN_DURATION);
        
                            _explode(this, fb.x, fb.y);
                            _doSplash(this, fb.x, fb.y, e);
        
                            fb.destroy();
                            checkHit.remove();
                            return;
                        }
                    }
        
                    // World / floor hit
                    if (fb.active && (fb.x < 0 || fb.x > 3600 || fb.body.blocked.down)) {
                        _explode(this, fb.x, fb.y);
                        _doSplash(this, fb.x, fb.y, null);
                        fb.destroy();
                        checkHit.remove();
                    }
                }
            });
        }
    _updateFireballs() {
        this.fireballs = this.fireballs.filter(fb => {
            // Guard: skip any malformed or already-cleaned entries
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
    
                    // â”€â”€ Direct hit (1-2 targets) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                    const toHit = Phaser.Utils.Array.Shuffle(hitEnemies).slice(0, Phaser.Math.Between(1, 2));
                    toHit.forEach(e => {
                        const dmg = Phaser.Math.Between(20, 35);
                        e.takeDamage(dmg, dir, false);
                        e.applyBurn(8, 5000);
                    });
    
                    // â”€â”€ Splash radius â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    
                    // â”€â”€ Explosion VFX â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  
        // Launch fireball on F key (blocked during judgement charge)
        if (Phaser.Input.Keyboard.JustDown(keys.fireball) && !this._jCharging) {
            this._launchFireball();
        }
        // Strike of Judgement R-hold charge + cooldown
        this._updateJudgement(delta);

        // Dash cooldown tick
        if (this.dashCooldown > 0) {
            this.dashCooldown = Math.max(0, this.dashCooldown - delta);
            this._drawDashCooldown(1 - this.dashCooldown / this.dashCooldownMax);
        }

        // Hold S — charge jump (blocked while Strike is charging)
        if (keys.down.isDown &&
            this.player.body.onFloor() &&
            !this.isAttacking &&
            !this._jCharging) {
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
        // Double-tap dash (blocked during judgement charge)
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
                if (this.soulOrb && Phaser.Input.Keyboard.JustDown(this.keys.breakOrb)) {
                    this._tryBreakOrb();
                }
        

        // Movement
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

        // Normal jump (blocked while S-charge or judgement charge)
        if (keys.up.isDown &&
            this.player.body.onFloor() &&
            !this.isAttacking &&
            !this.isCharging &&
            !this._jCharging) {
            this.player.setVelocityY(-220);
        }

        // Update enemies
        if (!this.inMirrorRealm) {
            this.enemies.forEach(e => e.update(delta, this.player));
 
            if (this.currentPhase === 'summon') {
                this._checkSummonPhaseComplete();
            }
            if (this.currentPhase === 'phase4') {
                this._checkPhase4WaveComplete();
            }
        } else {
            // Update alt ego in mirror realm
            if (this.altEgo && !this.altEgo.dead) {
                this.altEgo.update(delta, this.player);
            }
        }
        // Check summon phase completion
        if (this.currentPhase === 'summon' && !this.orbIsBroken) {
            this._checkSummonPhaseComplete();
          }
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