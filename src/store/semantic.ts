export type ID = string
export type Time = string
export type Timestamp = string

export type Timestamps<Deleted extends boolean = false> = {
    createdAt: Timestamp
    updatedAt: Timestamp
} & (Deleted extends true ? { deletedAt: Timestamp | null } : {})

export type Entity<Deleted extends boolean = false> = {
    id: ID
} & Timestamps<Deleted>

export type Sequence = number
export type Rank = string
export type Nullable<Value> = Value | null
export type Versioned<Value> = {
    value: Value
    sequence: Sequence
}

export type CreateInput<Model extends Entity<boolean>> = Omit<Model, keyof Entity<true>>
export type UpdateInput<Model extends Entity<boolean>> = Partial<CreateInput<Model>> & Pick<Model, 'id'>
