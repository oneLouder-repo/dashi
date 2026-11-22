/**
 * Where other plugins plug their facts into Rhizome. Each import below
 * registers an adapter with addFactAdapter (facts.js); buildFacts runs it
 * only when that plugin is on for the person. Rhizome's page and the seed
 * import this file, so a new source is one line here.
 *
 *   import '../place/facts.js';   // Place: places, pins, "located at" and "serves"
 */
import '../place/facts.js';

export {};
