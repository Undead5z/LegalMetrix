require('../src/db/init');
const assert = require('assert');
const { assessDeclarations } = require('../src/services/rule-engine.service');
const all = [{ field:'product_name',value:'Tea',confidence:.9,id:'1'},{field:'manufacturer',value:'Maker',confidence:.9,id:'2'},{field:'mrp',value:'₹40',confidence:.9,id:'3'},{field:'net_quantity',value:'200 g',confidence:.9,id:'4'},{field:'consumer_care_email',value:'care@example.in',confidence:.9,id:'5'}];
(async () => {
  const pass = await assessDeclarations({ inspectionId:'test', declarations:all });
  assert.equal(pass.findings.find(f=>f.field==='mrp').status,'PASS');
  assert.equal(pass.findings.find(f=>f.field==='date_declaration').status,'NOT_APPLICABLE');
  const noMrp = await assessDeclarations({ inspectionId:'test', declarations:all.filter(x=>x.field!=='mrp') });
  assert.equal(noMrp.findings.find(f=>f.field==='mrp').status,'POTENTIAL_NON_COMPLIANCE');
  const noQty = await assessDeclarations({ inspectionId:'test', declarations:all.filter(x=>x.field!=='net_quantity') });
  assert.equal(noQty.findings.find(f=>f.field==='net_quantity').status,'POTENTIAL_NON_COMPLIANCE');
  const noContact = await assessDeclarations({ inspectionId:'test', declarations:all.filter(x=>x.field!=='consumer_care_email') });
  assert.equal(noContact.findings.find(f=>f.field==='consumer_care_information').status,'POTENTIAL_NON_COMPLIANCE');
  const low = await assessDeclarations({ inspectionId:'test', declarations:all.map(x => x.field === 'mrp' ? { ...x, confidence: .4 } : x) });
  assert.equal(low.findings.find(f=>f.field==='mrp').status,'REVIEW_REQUIRED');
  console.log('Rule-engine MVP tests passed.');
})();
