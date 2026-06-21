export const DEFAULT_TOKEN_VISION_RANGE = 60;
export const DEFAULT_SCENE_FOG_MODE = 1;

export function buildNewTokenVisionDefaults() {
    return {
        sight: {
            enabled: true,
            range: DEFAULT_TOKEN_VISION_RANGE
        }
    };
}

export function buildNewSceneVisionDefaults() {
    return {
        tokenVision: true,
        environment: {
            darknessLevel: 0,
            globalLight: {
                enabled: 1,
                bright: true
            }
        },
        fog: {
            mode: DEFAULT_SCENE_FOG_MODE
        }
    };
}
