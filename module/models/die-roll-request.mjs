// DieRollRequest data model for Turn of the Century system
// Represents a request for one or more users to make a die roll (skill, attribute, save, combat, etc.)

export class DieRollRequest {
  /**
   * @param {Object} options
   * @param {string} options.id - Unique request ID
   * @param {string} options.initiatorId - User ID or effect ID that initiated the request
   * @param {Array<string>} options.recipientIds - Array of user IDs or actor IDs to make the roll
   * @param {string} options.rollType - Type of roll ("skill", "attribute", "save", "combat", etc.)
   * @param {string} options.rollSubType - Sub-type (e.g., "Animal Handling", "Strength", "To Hit")
   * @param {Array|number} options.modifiers - Array of modifier objects or a total modifier number
   * @param {string} [options.status] - Status ("pending", "completed", etc.)
   * @param {Object} [options.results] - Map of recipientId → {roll, total, timestamp}
   * @param {number} [options.timestamp] - Creation timestamp (ms)
   */
  constructor({
    id,
    initiatorId,
    recipientIds,
    rollType,
    rollSubType,
    modifiers = [],
    status = "pending",
    results = {},
    timestamp = Date.now(),
  }) {
    this.id = id;
    this.initiatorId = initiatorId;
    this.recipientIds = recipientIds;
    this.rollType = rollType;
    this.rollSubType = rollSubType;
    this.modifiers = modifiers;
    this.status = status;
    this.results = results;
    this.timestamp = timestamp;
  }
}
