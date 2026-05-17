import type { DataModel } from '../_generated/dataModel'

export type Doc<TableName extends keyof DataModel> =
  DataModel[TableName]['document']
