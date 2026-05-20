import * as Phaser from 'phaser';

export class TitleScene extends Phaser.Scene {
    constructor() {
        super({ key: 'TitleScene' });
    }

    preload() {
        this.load.setPath('assets');
        this.load.image('title_background', 'background.png');
    }

    create() {
        const W = this.cameras.main.width;
        const H = this.cameras.main.height;
        const CX = W / 2;
        const CY = H / 2;

        this.add.image(CX, CY, 'title_background')
            .setDisplaySize(W, H);

        this.add.rectangle(CX, CY, W, H, 0x000000, 0.18);

        this.add.text(CX, CY - 90, 'MARTIAL HERO', {
            fontSize: '52px',
            fill: '#ffffff',
            stroke: '#000000',
            strokeThickness: 6,
            fontStyle: 'bold',
            fontFamily: 'serif'
        }).setOrigin(0.5);

        const playBtn = this.add.rectangle(CX, CY + 20, 220, 64, 0x1b1b1b, 0.78)
            .setStrokeStyle(3, 0xffffff)
            .setInteractive({ useHandCursor: true });

        const playText = this.add.text(CX, CY + 20, 'PLAY', {
            fontSize: '28px',
            fill: '#ffffff',
            fontStyle: 'bold',
            fontFamily: 'monospace'
        }).setOrigin(0.5);

        playBtn.on('pointerover', () => {
            playBtn.setFillStyle(0x2d2d2d, 0.92);
            playText.setScale(1.04);
        });

        playBtn.on('pointerout', () => {
            playBtn.setFillStyle(0x1b1b1b, 0.78);
            playText.setScale(1);
        });

        playBtn.on('pointerdown', () => {
            this.cameras.main.fadeOut(350, 0, 0, 0);
            this.time.delayedCall(360, () => {
                this.scene.start('GameScene');
            });
        });
    }
}