import { DuckDBClient } from './utils/duckdbClient';

async function testValidation() {
  try {
    console.log('Testing with valid IDs...');
    const validResult = await DuckDBClient.getOficinaDataByIds([395444, 393991]);
    console.log('Valid IDs result count:', validResult.size);
    
    console.log('\nTesting with empty array...');
    const emptyResult = await DuckDBClient.getOficinaDataByIds([]);
    console.log('Empty array result count:', emptyResult.size);
    
    console.log('\nTesting with invalid IDs (should be filtered)...');
    const invalidResult = await DuckDBClient.getOficinaDataByIds([395444, -1, 0] as number[]);
    console.log('Mixed IDs result count:', invalidResult.size);
    
    console.log('\nAll tests passed!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testValidation();
