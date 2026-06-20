import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    ACTION_ICONS,
    resolveActionIcon
} from "../../module/encounters/action-icons.mjs";

describe("encounter action icons", () => {
    it("assigns distinct installed Game-icons.net art to universal actions", () => {
        const universalIds = ["move", "pursue", "follow", "avoid", "hunkDown", "dodge", "overwatch"];
        const icons = universalIds.map((id) => resolveActionIcon({ id }));

        assert.equal(new Set(icons).size, universalIds.length);
        assert.equal(icons.every((icon) => icon.startsWith("modules/game-icons-net/blackbackground/")), true);
    });

    it("covers generated and legacy item action identifiers", () => {
        const actionIds = [
            "meleeStrike", "twoHandedStrike", "thrownAttack", "rangedAttack",
            "quickShot", "pistolQuickShot", "aimedShot", "pistolAimedShot",
            "precisionStrike", "reload", "lightAndThrow", "flareShot",
            "weaponAttack", "consumeBeltElixir", "consumeItem", "useItem"
        ];

        for (const actionId of actionIds) {
            assert.equal(resolveActionIcon({ actionId }), ACTION_ICONS[actionId], actionId);
        }
    });

    it("prefers explicit action art and falls back through item and action type art", () => {
        assert.equal(
            resolveActionIcon({ id: "move", img: "worlds/demo/assets/images/ui/custom-move.webp" }),
            "worlds/demo/assets/images/ui/custom-move.webp"
        );
        assert.equal(
            resolveActionIcon({ id: "customTechnique", type: "attack" }, { itemIcon: "icons/weapons/sword.webp" }),
            "icons/weapons/sword.webp"
        );
        assert.equal(
            resolveActionIcon({ id: "customDefense", type: "defense" }),
            "modules/game-icons-net/blackbackground/bordered-shield.svg"
        );
        assert.equal(resolveActionIcon({}), "icons/svg/d20-grey.svg");
    });
});
