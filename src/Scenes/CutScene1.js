import * as Phaser from 'phaser';

export class Cutscene1 extends Phaser.Scene {
  constructor() {
    super({ key: 'Cutscene1' });
  }

  preload() {
    this.load.setPath('assets');

    this.load.image('background', 'background.png');
    this.load.image('floor', 'floor.png');
    this.load.image('alert', 'alert.png');
    this.load.image('man', 'Man.png');

    this.load.spritesheet('char', 'Idle.png', { frameWidth: 200, frameHeight: 200 });
    this.load.spritesheet('run', 'Run.png', { frameWidth: 200, frameHeight: 200 });

    this.load.spritesheet('finalBoss_idle', './enemies/final_boss/idle.png', {
      frameWidth: 100,
      frameHeight: 100
    });

    this.load.spritesheet('finalBoss_idle2', './enemies/final_boss/idle2.png', {
      frameWidth: 100,
      frameHeight: 100
    });

    this.load.spritesheet('monster_idle', './enemies/Skeleton/Idle.png', {
      frameWidth: 150,
      frameHeight: 150
    });
  }

  create() {
    this.physics.world.setBounds(0, 0, 2400, 600);

    this.add.tileSprite(1200, 300, 2400, 600, 'background');

    const floor = this.add.tileSprite(1200, 600, 2400, 110, 'floor').setOrigin(0.5, 1);
    this.physics.add.existing(floor, true);
    floor.body.setSize(2400, 110);
    floor.body.updateFromGameObject();

    const safe = (key, cfg) => {
      if (!this.anims.exists(key)) this.anims.create(cfg);
    };

    safe('cutscene_player_idle', {
      key: 'cutscene_player_idle',
      frames: this.anims.generateFrameNumbers('char', { start: 0, end: 7 }),
      frameRate: 8,
      repeat: -1
    });

    safe('cutscene_player_run', {
      key: 'cutscene_player_run',
      frames: this.anims.generateFrameNumbers('run', { start: 0, end: 7 }),
      frameRate: 10,
      repeat: -1
    });

    safe('finalBoss_idle_anim', {
      key: 'finalBoss_idle_anim',
      frames: this.anims.generateFrameNumbers('finalBoss_idle', { start: 0, end: 4 }),
      frameRate: 7,
      repeat: -1
    });

    safe('finalBoss_idle2_anim', {
      key: 'finalBoss_idle2_anim',
      frames: this.anims.generateFrameNumbers('finalBoss_idle2', { start: 0, end: 7 }),
      frameRate: 9,
      repeat: -1
    });

    safe('monster_idle_anim', {
      key: 'monster_idle_anim',
      frames: this.anims.generateFrameNumbers('monster_idle', { start: 0, end: 3 }),
      frameRate: 8,
      repeat: -1
    });

    const gfx = this.make.graphics({ x: 0, y: 0, add: false });
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(4, 4, 4);
    gfx.generateTexture('cutscene_particle', 8, 8);
    gfx.destroy();

    this.player = this.physics.add.sprite(120, 450, 'char');
    this.player.setScale(1.4);
    this.player.body.setSize(40, 40);
    this.player.body.setOffset(80, 80);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, floor);
    this.player.anims.play('cutscene_player_idle', true);

    this.reaper = this.add.sprite(1580, 395, 'finalBoss_idle')
      .setScale(4.2)
      .setDepth(8)
      .setFlipX(true);
    this.reaper.anims.play('finalBoss_idle2_anim', true);

    this.man = this.add.image(1380, 238, 'man')
      .setScale(1.12)
      .setAngle(90)
      .setDepth(7)
      .setAlpha(0.95);

    this.tweens.add({
      targets: this.man,
      y: this.man.y - 16,
      angle: 84,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.manGlow = this.add.circle(this.man.x, this.man.y, 58, 0xcfefff, 0.08).setDepth(6);

    this.tweens.add({
      targets: this.manGlow,
      scaleX: 1.12,
      scaleY: 1.12,
      alpha: 0.14,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.alert = this.add.image(this.reaper.x, this.reaper.y - 135, 'alert')
      .setScale(0.08)
      .setVisible(false)
      .setDepth(20);

    this.dialogueBox = null;
    this.nameText = null;
    this.dialogueText = null;
    this.typeEvent = null;

    this.cameras.main.setBounds(0, 0, 2400, 600);
    this.cameras.main.fadeIn(700, 0, 0, 0);
    this.cameras.main.centerOn(220, 300);

    this.startSequence();
  }

  wait(ms) {
    return new Promise(resolve => this.time.delayedCall(ms, resolve));
  }

  ensureDialogueUI() {
    if (this.dialogueBox) return;

    this.dialogueBox = this.add.graphics().setScrollFactor(0).setDepth(30);
    this.nameText = this.add.text(85, 444, '', {
      fontSize: '18px',
      fill: '#ffcf70',
      stroke: '#000000',
      strokeThickness: 3,
      fontStyle: 'bold'
    }).setScrollFactor(0).setDepth(31);

    this.dialogueText = this.add.text(85, 478, '', {
      fontSize: '22px',
      fill: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
      wordWrap: { width: 625 }
    }).setScrollFactor(0).setDepth(31);

    this.redrawDialogueBox();
  }

  redrawDialogueBox() {
    if (!this.dialogueBox) return;
    this.dialogueBox.clear();
    this.dialogueBox.fillStyle(0x000000, 0.72);
    this.dialogueBox.fillRoundedRect(55, 428, 690, 125, 12);
    this.dialogueBox.lineStyle(2, 0xffffff, 0.15);
    this.dialogueBox.strokeRoundedRect(55, 428, 690, 125, 12);
  }

  hideDialogue() {
    if (this.typeEvent) {
      this.typeEvent.remove(false);
      this.typeEvent = null;
    }
    if (!this.dialogueBox) return;
    this.dialogueBox.clear();
    this.nameText.setText('');
    this.dialogueText.setText('');
  }

  typeText(target, text, speed = 32) {
    return new Promise(resolve => {
      if (this.typeEvent) {
        this.typeEvent.remove(false);
        this.typeEvent = null;
      }
  
      target.setText('');
      let i = 0;
  
      const evt = this.time.addEvent({
        delay: speed,
        loop: true,
        callback: () => {
          i += 1;
          target.setText(text.slice(0, i));
  
          if (i >= text.length) {
            evt.remove(false);
            if (this.typeEvent === evt) this.typeEvent = null;
            resolve();
          }
        }
      });
  
      this.typeEvent = evt;
    });
  }

  async say(name, text, hold = 1300, typeSpeed = 32) {
    this.ensureDialogueUI();
    this.redrawDialogueBox();
    this.nameText.setText(name);
    await this.typeText(this.dialogueText, text, typeSpeed);
    await this.wait(hold);
  }

  showAlert() {
    this.alert.setVisible(true).setAlpha(1);
    const startY = this.alert.y;

    this.tweens.add({
      targets: this.alert,
      y: startY - 16,
      duration: 160,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.alert.setPosition(this.reaper.x, this.reaper.y - 135);
        this.time.delayedCall(900, () => {
          this.tweens.add({
            targets: this.alert,
            alpha: 0,
            duration: 280,
            onComplete: () => this.alert.setVisible(false)
          });
        });
      }
    });
  }

  createSoulEffect() {
    this.soulCore = this.add.circle(this.man.x - 20, this.man.y + 4, 14, 0xb8f0ff, 0.95).setDepth(11);
    this.soulMid = this.add.circle(this.man.x - 20, this.man.y + 4, 26, 0x9be7ff, 0.22).setDepth(10);
    this.soulOuter = this.add.circle(this.man.x - 20, this.man.y + 4, 40, 0xd8fbff, 0.10).setDepth(9);

    this.soulParticles = this.add.particles(this.soulCore.x, this.soulCore.y, 'cutscene_particle', {
      speed: { min: 8, max: 26 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.7, end: 0 },
      blendMode: 'ADD',
      lifespan: 500,
      quantity: 2,
      frequency: 55,
      tint: [0x8fe9ff, 0xc9f7ff, 0xffffff]
    }).setDepth(12);

    this.soulBeam = this.add.graphics().setDepth(8);
  }

  updateSoulBeam() {
    if (!this.soulCore || !this.soulBeam) return;

    this.soulBeam.clear();
    this.soulBeam.lineStyle(4, 0x8fe9ff, 0.22);
    this.soulBeam.lineBetween(this.man.x - 10, this.man.y, this.soulCore.x, this.soulCore.y);
    this.soulBeam.lineStyle(2, 0xffffff, 0.35);
    this.soulBeam.lineBetween(this.man.x - 10, this.man.y, this.soulCore.x, this.soulCore.y);
  }

  async extractSoul() {
    this.createSoulEffect();

    this.tweens.add({
      targets: [this.soulMid, this.soulOuter],
      scaleX: 1.22,
      scaleY: 1.22,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    const followEvt = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        if (!this.soulCore?.active) return;
        this.soulParticles.setPosition(this.soulCore.x, this.soulCore.y);
        this.updateSoulBeam();
      }
    });

    this.tweens.add({
      targets: [this.soulCore, this.soulMid, this.soulOuter],
      x: this.reaper.x - 78,
      y: this.reaper.y - 36,
      duration: 2100,
      ease: 'Cubic.easeInOut'
    });

    this.tweens.add({
      targets: this.man,
      alpha: 0.38,
      duration: 1900,
      ease: 'Sine.easeOut'
    });

    this.tweens.add({
      targets: this.manGlow,
      alpha: 0.02,
      duration: 1900,
      ease: 'Sine.easeOut'
    });

    await this.wait(2200);

    this.tweens.add({
      targets: [this.soulCore, this.soulMid, this.soulOuter],
      scaleX: 0.1,
      scaleY: 0.1,
      alpha: 0,
      duration: 420,
      ease: 'Back.easeIn'
    });

    await this.wait(430);

    followEvt.remove(false);
    this.soulParticles?.destroy();
    this.soulBeam?.destroy();
    this.soulCore?.destroy();
    this.soulMid?.destroy();
    this.soulOuter?.destroy();
  }

  async transformVictim() {
    const flash = this.add.rectangle(this.man.x, this.man.y, 180, 180, 0xdff8ff, 0).setDepth(13);

    this.tweens.add({
      targets: flash,
      alpha: 0.9,
      duration: 120,
      yoyo: true,
      repeat: 2
    });

    this.tweens.add({
      targets: this.man,
      angle: 0,
      y: 410,
      alpha: 0,
      duration: 520,
      ease: 'Cubic.easeIn'
    });

    await this.wait(420);

    this.man.destroy();
    this.manGlow.destroy();

    this.monster = this.add.sprite(1380, 418, 'monster_idle')
      .setScale(1.55)
      .setDepth(8)
      .setAlpha(0);

    this.monster.anims.play('monster_idle_anim', true);

    this.tweens.add({
      targets: this.monster,
      alpha: 1,
      duration: 250
    });

    this.tweens.add({
      targets: this.monster,
      y: this.monster.y - 12,
      duration: 650,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut'
    });

    this.time.delayedCall(220, () => flash.destroy());
  }

  async introRunAndReveal() {
    this.player.setPosition(120, 450);
    this.player.setFlipX(false);
    this.player.anims.play('cutscene_player_run', true);

    this.tweens.add({
      targets: this.player,
      x: 520,
      duration: 2100,
      ease: 'Linear'
    });

    this.cameras.main.pan(780, 300, 2100, 'Sine.easeInOut');
    await this.wait(2150);

    this.player.anims.play('cutscene_player_idle', true);

    this.cameras.main.pan(1450, 300, 1600, 'Sine.easeInOut');
    await this.wait(1650);
  }

  async bringPlayerBackIntoFrame() {
    this.player.setPosition(970, 450);
    this.player.setFlipX(false);
    this.player.anims.play('cutscene_player_run', true);

    this.tweens.add({
      targets: this.player,
      x: 1185,
      duration: 980,
      ease: 'Sine.easeOut'
    });

    await this.wait(1000);
    this.player.anims.play('cutscene_player_idle', true);
  }

  async startSequence() {
    await this.introRunAndReveal();

    await this.say('Grim Reaper', 'Veronica… just a little more.', 1100, 34);

    this.hideDialogue();
    await this.wait(350);

    await this.extractSoul();
    await this.wait(450);

    await this.say('Grim Reaper', 'I will bring you back, Veronica.', 1250, 32);

    this.hideDialogue();
    await this.wait(500);

    await this.transformVictim();
    await this.wait(500);

    await this.bringPlayerBackIntoFrame();
    await this.wait(800);

    this.showAlert();
    await this.wait(650);

    await this.say('Grim Reaper', 'You dare interrupt me? Then die.', 1500, 28);

    this.hideDialogue();
    await this.wait(150);

    this.cameras.main.flash(250, 255, 255, 255, false);
    await this.wait(250);

    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('BossFightScene');
    });
  }
}