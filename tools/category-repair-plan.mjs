import fs from 'node:fs/promises'
import path from 'node:path'

const directory = process.argv[2]
const audit = JSON.parse(await fs.readFile(path.join(directory, 'category-links-full-private.json'), 'utf8'))
const plan = {
  status: 'prepared-not-applied',
  scope: 'Complete category catalog and launch references; preserve raw snapshots and payment state.',
  approvedByUser: [{ subcategoryName: 'Lavagem', categoryName: 'Carro' }, { subcategoryName: 'IPVA', categoryName: 'Carro' }],
  rules: [
    'Load all source category UUIDs into the destination staging before remapping device-local IDs.',
    'Keep an explicit category UUID; never replace it with a same-number local ID.',
    'Retain categories with the same name and different UUIDs until identity mapping is verified.',
    'Do not reclassify launches by their descriptions or choose one phone as universally authoritative.'
  ],
  sourcePlans: audit.sources.map(source => ({
    label: source.label, deviceId: source.deviceId,
    references: source.records.filter(record => record.issues.length).map(record => ({
      launchUuid: record.uuid, originalLocalId: record.localId, deleted: record.deleted,
      preservedCategoryUuid: record.storedCategoryUuid,
      referencedNames: record.expectedNamesFromUuid,
      subcategoryParentNeedsReview: record.issues.includes('subcategory_parent_differs_from_launch_category'),
      action: record.storedCategoryUuid && record.expectedNamesFromUuid.length === 1
        ? 'preserve_uuid_and_rebuild_local_relation_after_full_catalog_load' : 'review_required',
      originalIssues: record.issues
    }))
  }))
}
await fs.writeFile(path.join(directory, 'category-repair-plan-private.json'), JSON.stringify(plan, null, 2))
console.log(JSON.stringify({ status: plan.status, sources: plan.sourcePlans.map(source => ({
  label: source.label, referencesPrepared: source.references.length,
  requireReview: source.references.filter(r => r.action === 'review_required' || r.subcategoryParentNeedsReview).length
})), approvedCategory: 'Carro', approvedSubcategories: ['Lavagem', 'IPVA'] }, null, 2))
