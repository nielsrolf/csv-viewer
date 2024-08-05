import * as assert from 'assert';
import { describe, it } from 'mocha';

// You can import your extension here if needed
// import * as myExtension from '../../extension';

describe('Extension Test Suite', () => {
    it('Sample test', () => {
        assert.strictEqual(-1, [1, 2, 3].indexOf(5));
        assert.strictEqual(-1, [1, 2, 3].indexOf(0));
    });
});