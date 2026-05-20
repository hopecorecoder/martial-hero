import * as Phaser from 'phaser';
import { GameScene } from './Scenes/GameScene';
import { Level2Scene } from './Scenes/Level2Scene';
import { Cutscene1 } from './Scenes/CutScene1';
import { BossFightScene } from './Scenes/BossFight';
import { Cutscene2 } from './Scenes/CutScene2';
import { TitleScene } from './Scenes/Titlescreen';

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 300 }, debug: false}
    },
    scene: [TitleScene,GameScene,Level2Scene,Cutscene1,BossFightScene,Cutscene2]  
};

new Phaser.Game(config);