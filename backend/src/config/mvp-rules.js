module.exports = [
  ['LM-MVP-PRODUCT-NAME','Product/common name','product_name','A product or common name should be detected.','ALWAYS','PRESENCE'],
  ['LM-MVP-BUSINESS-INFO','Manufacturer / packer / importer information','business_information','At least one applicable business declaration should be detected.','ALWAYS','PRESENCE_ANY'],
  ['LM-MVP-NET-QUANTITY','Net quantity','net_quantity','Net quantity should be detected in a supported unit format.','ALWAYS','FORMAT_QUANTITY'],
  ['LM-MVP-MRP','Maximum Retail Price','mrp','MRP should be detected in a supported currency format.','ALWAYS','FORMAT_MRP'],
  ['LM-MVP-CONSUMER-CARE','Consumer-care information','consumer_care_information','At least one consumer-care phone number or email should be detected.','ALWAYS','PRESENCE_ANY'],
  ['LM-MVP-DATE','Date declaration','date_declaration','Where date information is applicable/detected, it should be in a recognisable date format.','DATE_APPLICABLE','FORMAT_DATE']
].map(([ruleCode, name, field, requirement, applicability, validationType]) => ({ ruleCode, name, field, requirement, applicability, legalReference: 'LEGAL_REFERENCE_PENDING_VERIFICATION', version: 'MVP-1.0', effectiveFrom: '2026-01-01', effectiveTo: null, active: true, validationType }));
