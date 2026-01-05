/**
 * Issue #237 - Mock the face manager filtering logic
 *
 * SCENARIO 2 (from user clarification):
 * - A person has thumbnails from OTHER photos (previous batches)
 * - But for THIS processed image, their face was deleted
 * - We should ONLY look at the current processed image
 * - If no valid thumbnail from CURRENT batch → don't show the group
 */

// ============================================================
// SIMULATED DATA
// ============================================================

// Current batch: User processed this 1 image
const currentBatchFiles = [
  { fileId: 'img-002', url: 'https://storage.example.com/new-family-photo.jpg' },
];

const currentBatchFileIds = new Set(currentBatchFiles.map(f => f.fileId));

console.log('='.repeat(60));
console.log('SCENARIO 2: Group has thumbnail from OTHER photo,');
console.log('            but face from CURRENT photo was deleted');
console.log('='.repeat(60));
console.log('Current batch files:', [...currentBatchFileIds]);

// ============================================================
// ALL FACES (from multiple photos)
// ============================================================

const allFaces = [
  // ===== Faces from PREVIOUS photo (img-001) =====
  // These are valid thumbnails from a prior batch
  { faceId: 'face-1', fileId: 'img-001', deleted: false, hasThumbnail: true },  // Mom from old photo
  { faceId: 'face-2', fileId: 'img-001', deleted: false, hasThumbnail: true },  // Dad from old photo

  // ===== Faces from CURRENT photo (img-002) =====
  // Mom's face in new photo - KEPT
  { faceId: 'face-3', fileId: 'img-002', deleted: false, hasThumbnail: true },

  // Dad's face in new photo - DELETED (user removed it)
  { faceId: 'face-4', fileId: 'img-002', deleted: true, hasThumbnail: false },

  // Grandma - only in current photo, DELETED
  { faceId: 'face-5', fileId: 'img-002', deleted: true, hasThumbnail: false },

  // Uncle - only in current photo, KEPT
  { faceId: 'face-6', fileId: 'img-002', deleted: false, hasThumbnail: true },
];

console.log('\n' + '='.repeat(60));
console.log('ALL FACES');
console.log('='.repeat(60));
allFaces.forEach(f => {
  const status = f.deleted ? '❌ DELETED' : '✅ KEPT';
  const batch = currentBatchFileIds.has(f.fileId) ? '📌 CURRENT' : '📁 PREVIOUS';
  console.log(`  ${f.faceId} (${f.fileId}) - ${batch} - ${status}`);
});

// ============================================================
// GROUPS
// ============================================================

const allGroups = [
  // Mom: has face from previous photo AND current photo (current is KEPT)
  { groupId: 'group-1', personName: 'Mom', faceIds: ['face-1', 'face-3'] },

  // Dad: has face from previous photo AND current photo (current is DELETED)
  { groupId: 'group-2', personName: 'Dad', faceIds: ['face-2', 'face-4'] },

  // Grandma: only in current photo, DELETED
  { groupId: 'group-3', personName: 'Grandma', faceIds: ['face-5'] },

  // Uncle: only in current photo, KEPT
  { groupId: 'group-4', personName: 'Uncle', faceIds: ['face-6'] },
];

console.log('\n' + '='.repeat(60));
console.log('GROUPS');
console.log('='.repeat(60));
allGroups.forEach(g => {
  console.log(`  ${g.groupId} (${g.personName}): faces = [${g.faceIds.join(', ')}]`);
});

console.log('\n' + '='.repeat(60));
console.log('EXPECTED RESULTS');
console.log('='.repeat(60));
console.log(`
  Mom (group-1):    SHOW - has face-3 from current batch with thumbnail
  Dad (group-2):    HIDE - face-4 is from current batch but DELETED
                          (face-2 has thumbnail but it's from PREVIOUS batch)
  Grandma (group-3): HIDE - face-5 is from current batch but DELETED
  Uncle (group-4):   SHOW - has face-6 from current batch with thumbnail
`);

// ============================================================
// THE FILTER LOGIC
// ============================================================

console.log('='.repeat(60));
console.log('FILTERING');
console.log('='.repeat(60));

const filteredGroups = allGroups.filter(group => {
  // Does this group have a face that is:
  // 1. From current batch file, AND
  // 2. NOT deleted (has thumbnail)
  const hasValidFaceFromCurrentBatch = group.faceIds.some(faceId => {
    const face = allFaces.find(f => f.faceId === faceId);
    if (!face) return false;

    const isFromCurrentBatch = currentBatchFileIds.has(face.fileId);
    const hasValidThumbnail = !face.deleted && face.hasThumbnail;

    if (isFromCurrentBatch) {
      console.log(`  Checking ${faceId} in ${group.personName}: fromBatch=YES, thumbnail=${hasValidThumbnail ? 'YES' : 'NO'}`);
    }

    return isFromCurrentBatch && hasValidThumbnail;
  });

  if (hasValidFaceFromCurrentBatch) {
    console.log(`✅ SHOW: ${group.groupId} (${group.personName})`);
  } else {
    console.log(`❌ HIDE: ${group.groupId} (${group.personName})`);
  }

  return hasValidFaceFromCurrentBatch;
});

// ============================================================
// RESULTS
// ============================================================

console.log('\n' + '='.repeat(60));
console.log('RESULTS');
console.log('='.repeat(60));

console.log(`\nInput: ${allGroups.length} groups`);
console.log(`Output: ${filteredGroups.length} groups to display\n`);

console.log('Groups to DISPLAY:');
filteredGroups.forEach(g => console.log(`  ✅ ${g.groupId} - ${g.personName}`));

console.log('\nGroups HIDDEN:');
allGroups.filter(g => !filteredGroups.includes(g)).forEach(g => {
  console.log(`  ❌ ${g.groupId} - ${g.personName}`);
});

// ============================================================
// VERIFY EXPECTED
// ============================================================

console.log('\n' + '='.repeat(60));
console.log('VERIFICATION');
console.log('='.repeat(60));

const expected = ['group-1', 'group-4']; // Mom and Uncle
const actual = filteredGroups.map(g => g.groupId);

const isCorrect = expected.length === actual.length &&
                  expected.every(id => actual.includes(id));

if (isCorrect) {
  console.log('✅ PASS: Filter logic is correct!');
  console.log('   Expected: Mom, Uncle');
  console.log('   Got: Mom, Uncle');
} else {
  console.log('❌ FAIL: Filter logic is wrong!');
  console.log('   Expected:', expected);
  console.log('   Got:', actual);
}
