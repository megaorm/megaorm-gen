import {
  isBool,
  isFullStr,
  isNull,
  isNum,
  isSnakeCase,
  isUndefined,
} from '@megaorm/test';

// Full operation constants
export const CASCADE = Symbol('CASCADE');
export const SET_NULL = Symbol('SET NULL');
export const SET_DEFAULT = Symbol('SET DEFAULT');
export const RESTRICT = Symbol('RESTRICT');
export const NO_ACTION = Symbol('NO ACTION');

// Shortcuts
export const CA: typeof CASCADE = CASCADE;
export const ST: typeof SET_NULL = SET_NULL;
export const SD: typeof SET_DEFAULT = SET_DEFAULT;
export const RE: typeof RESTRICT = RESTRICT;
export const NA: typeof NO_ACTION = NO_ACTION;

/**
 * Creates a foreign key constraint in a relational database.
 */
type Foreign = {
  /**
   * Specifies the table and column(s) being referenced by the foreign key.
   */
  references: {
    /**
     * The name of the referenced table.
     */
    table: string;

    /**
     * The name of the referenced column(s).
     */
    column: string;
  };

  /**
   * Action to take on delete in the child table.
   * - `CASCADE`: Delete the rows in the child table references the deleted row.
   * - `SET_NULL`: Set the foreign key columns in the child table to NULL.
   * - `SET_DEFAULT`: Set the foreign key columns in the child table to their default values.
   * - `RESTRICT`: Prevent deletion of the referenced row if it has related rows in the child table.
   * - `NO_ACTION`: No action is taken; any necessary action is deferred until the end of the transaction.
   */
  onDelete:
    | typeof CASCADE
    | typeof SET_NULL
    | typeof SET_DEFAULT
    | typeof RESTRICT
    | typeof NO_ACTION;

  /**
   * Action to take on update in the child table.
   * - `CASCADE`: Update the rows in the child table that reference the updated row.
   * - `SET_NULL`: Set the foreign key columns in the child table to NULL.
   * - `SET_DEFAULT`: Set the foreign key columns in the child table to their default values.
   * - `RESTRICT`: Prevent update of the referenced row if it has related rows in the child table.
   * - `NO_ACTION`: No action is taken; any necessary action is deferred until the end of the transaction.
   */
  onUpdate:
    | typeof CASCADE
    | typeof SET_NULL
    | typeof SET_DEFAULT
    | typeof RESTRICT
    | typeof NO_ACTION;
};

/**
 * Creates various constraints that can be applied to a column in a relational database.
 */
type Constraints = {
  /**
   * Creates a primary key constraint.
   */
  primaryKey?: boolean;

  /**
   * Creates a unique constraint.
   */
  unique?: boolean;

  /**
   * Indicates whether the column cannot contain NULL values.
   */
  notNull?: boolean;

  /**
   * Indicates whether the column is auto-incremented.
   */
  autoIncrement?: boolean;

  /**
   * Indicates whether the column is unsigned.
   */
  unsigned?: boolean;

  /**
   * Creates a foreign key constraint.
   */
  foreignKey?: Foreign;

  /**
   * Creates a check constraint.
   */
  checks?: Array<string>;

  /**
   * Creates the default value for the column.
   */
  default?: string | number | boolean | null;

  /**
   * Creates an index on the column.
   */
  index?: boolean;
};

interface Getter {
  /**
   * Gets the name of the column.
   * @returns The name of the column.
   */
  name(): string;

  /**
   * Gets the type of the column.
   * @returns The type of the column.
   */
  type(): string;

  /**
   * Gets the constraints applied to the column.
   * @returns The constraints of the column.
   */
  constraints(): Constraints;
}

/**
 * Checks if the given operation is a valid database operation type.
 *
 * This function verifies whether the specified operation is one of the predefined operations
 * used in foreign key constraints. The valid operations include CASCADE, SET_NULL,
 * SET_DEFAULT, RESTRICT, and NO_ACTION.
 *
 * @param operation - The operation to check. This can be any value.
 * @returns `boolean` Returns true if the operation is valid, otherwise false.
 *
 */
function isOperation(operation: any): boolean {
  const operations = [CASCADE, SET_NULL, SET_DEFAULT, RESTRICT, NO_ACTION];
  return operations.includes(operation);
}

/**
 * Represents an error related to the MegaColumn operations.
 */
export class MegaColumnError extends Error {}

/**
 * Abstract class representing a column in a database schema.
 * @abstract
 */
export abstract class MegaColumn {
  /**
   * The name of the column.
   * @type `string`
   * @private
   */
  protected name: string;

  /**
   * The raw type of the column.
   * @type `string`
   * @protected
   */
  protected type: string;

  /**
   * The constraints applied to the column.
   * @type `Constraints`
   * @protected
   */
  protected constraints: Constraints;

  /**
   * Constructs a new MegaColumn.
   *
   * @param name The name of the column.
   * @throws `MegaColumnError` If the provided name is invalid (i.e., not in `snake_case`).
   *
   * // Attempting to create a MegaColumn instance
   * new MegaColumn('name'); // MegaColumnError: 'Cannot construct MegaColumn instances directly'
   *
   * @note This is an abstract class. You should not instantiate `MegaColumn` directly
   * @note Use a subclass like `MySQLColumn`, `SQLiteColumn`, or `PostgreSQLColumn`.
   */
  constructor(name: string) {
    if (new.target === MegaColumn) {
      throw new MegaColumnError(
        'Cannot construct MegaColumn instances directly'
      );
    }

    if (!isSnakeCase(name)) {
      throw new MegaColumnError(`Invalid column name: ${String(name)}`);
    }

    this.constraints = {};
    this.name = name;
  }

  /**
   * Get methods for accessing column properties.
   * These methods allow retrieval of the column's name, type, and constraints.
   *
   */
  public get: Getter = {
    name: () => this.name,
    type: () => this.type,
    constraints: () => this.constraints,
  };

  /**
   * Marks the column as `UNSIGNED` for integer types, meaning it cannot store negative values.
   *
   * @returns `MegaColumn` The column instance with `UNSIGNED` applied.
   *
   */
  public unsigned(): MegaColumn {
    this.constraints.unsigned = true;
    return this;
  }

  /**
   * Creates a NOT NULL constraint for the column.
   * NOT NULL columns cannot store NULL values.
   *
   * @returns `MegaColumn` The MegaColumn instance.
   *
   */
  public notNull(): MegaColumn {
    this.constraints.notNull = true;
    return this;
  }

  /**
   * Marks the column as `AUTO_INCREMENT`, automatically generating sequential values.
   *
   * @returns `MegaColumn` The column instance with `AUTO_INCREMENT` applied.
   *
   */
  public autoIncrement(): MegaColumn {
    this.constraints.autoIncrement = true;
    return this;
  }

  /**
   * Creates a default value for the column.
   *
   * This method sets a default value that will be used when no value is provided during insertion.
   *
   * @param value - The default value to set. Must be a `string`, `number`, `boolean`, or `null`.
   * @returns `MegaColumn` The MegaColumn instance with the default value applied.
   * @throws `MegaColumnError` If the value is not a `string`, `number`, `boolean`, or `null`.
   *
   */
  public default(value: string | number | boolean | null): MegaColumn {
    if (isFullStr(value)) {
      this.constraints.default = `'${value}'`;
      return this;
    }

    if (isNum(value)) {
      this.constraints.default = value.toString();
      return this;
    }

    if (isNull(value)) {
      this.constraints.default = 'NULL';
      return this;
    }

    if (isBool(value)) {
      this.constraints.default = value === true ? '1' : '0';
      return this;
    }

    throw new MegaColumnError(`Invalid default value: ${String(value)}`);
  }

  /**
   * Creates a unique constraint for the column.
   *
   * A unique constraint ensures that all values in the column are distinct, preventing duplicate entries.
   *
   * @returns `MegaColumn` The MegaColumn instance with the unique constraint applied.
   *
   */
  public unique(): MegaColumn {
    this.constraints.unique = true;
    return this;
  }

  /**
   * Creates a primary key constraint for the column.
   *
   * A primary key constraint uniquely identifies each record in the table.
   * It ensures that the column has unique values and does not allow NULLs.
   *
   * @returns `MegaColumn` The MegaColumn instance with the primary key constraint applied.
   *
   */
  public primaryKey(): MegaColumn {
    this.constraints.primaryKey = true;
    return this;
  }

  /**
   * Creates a foreign key constraint for the column.
   *
   * A foreign key constraint establishes a relationship between the current table and another table, ensuring referential integrity.
   * It allows you to specify the referenced table and column, as well as the actions to take on update and delete.
   *
   * @returns `MegaColumn` The MegaColumn instance with the foreign key constraint applied.
   *
   */
  public foreignKey(): MegaColumn {
    this.constraints.foreignKey = {
      references: undefined,
      onUpdate: undefined,
      onDelete: undefined,
    };

    return this;
  }

  /**
   * Specifies the table and column that the foreign key references.
   *
   * This method is used to establish a link between the current column and a column in another table,
   * enforcing referential integrity in the database.
   *
   * @param table - The name of the referenced table.
   * @param column - The name of the referenced column.
   * @returns `MegaColumn` The MegaColumn instance with the foreign key reference set.
   * @throws `MegaColumnError` If the table or column name is not a string or is empty.
   * @throws `MegaColumnError` If the foreign key constraint is not defined.
   *
   */
  public references(table: string, column: string): MegaColumn {
    if (!isFullStr(table)) {
      throw new MegaColumnError(`Invalid table name: ${String(table)}`);
    }

    if (!isFullStr(column)) {
      throw new MegaColumnError(`Invalid column name: ${String(column)}`);
    }

    // Make sure the foreign key exists
    if (isUndefined(this.constraints.foreignKey)) {
      throw new MegaColumnError('Undefined foreign key');
    }

    this.constraints.foreignKey.references = { table, column };

    return this;
  }

  /**
   * Specifies the table and column that the foreign key references.
   *
   * This method is used to establish a link between the current column and a column in another table,
   * enforcing referential integrity in the database.
   *
   * @param table - The name of the referenced table.
   * @param column - The name of the referenced column.
   * @returns `MegaColumn` The MegaColumn instance with the foreign key reference set.
   * @throws `MegaColumnError` If the table or column name is not a string or is empty.
   * @throws `MegaColumnError` If the foreign key constraint is not defined.
   *
   */
  public ref(table: string, column: string): MegaColumn {
    return this.references(table, column);
  }

  /**
   * Creates an `ON UPDATE` constraint for the foreign key.
   *
   * @param operation - The operation to perform on update.
   * @returns `MegaColumn` The MegaColumn instance.
   * @throws `MegaColumnError` If the operation is not valid or if the foreign key constraint is not defined.
   */
  public onUpdate(
    operation:
      | typeof CASCADE
      | typeof SET_NULL
      | typeof SET_DEFAULT
      | typeof RESTRICT
      | typeof NO_ACTION
  ): MegaColumn {
    if (!isOperation(operation)) {
      throw new MegaColumnError(`Invalid operation: ${String(operation)}`);
    }

    // Make sure a foreign key exists
    if (isUndefined(this.constraints.foreignKey)) {
      throw new MegaColumnError('Undefined foreign key');
    }

    this.constraints.foreignKey.onUpdate = operation;
    return this;
  }

  /**
   * Creates an ON DELETE constraint for the foreign key.
   *
   * @param operation - The operation to perform on delete.
   * @returns `MegaColumn` The MegaColumn instance.
   * @throws `MegaColumnError` If the operation is not valid or if the foreign key constraint is not defined.
   */
  public onDelete(
    operation:
      | typeof CASCADE
      | typeof SET_NULL
      | typeof SET_DEFAULT
      | typeof RESTRICT
      | typeof NO_ACTION
  ): MegaColumn {
    if (!isOperation(operation)) {
      throw new MegaColumnError('Invalid operation provided');
    }

    // Make sure a foreign key exists
    if (isUndefined(this.constraints.foreignKey)) {
      throw new MegaColumnError('Undefined foreign key');
    }

    this.constraints.foreignKey.onDelete = operation;
    return this;
  }

  /**
   * Creates a CHECK constraint for the column.
   *
   * A CHECK constraint allows you to specify a condition that must be met for each row
   * in the table. This can help enforce data integrity by ensuring that only valid data
   * is inserted into the column.
   *
   * @param condition - The check condition (e.g., 'age >= 18').
   * @returns `MegaColumn` The MegaColumn instance with the CHECK constraint applied.
   * @throws `MegaColumnError` If the condition is invalid or empty.
   *
   */
  public check(condition: string): MegaColumn {
    if (!isFullStr(condition)) {
      throw new MegaColumnError(
        `Invalid check condition: ${String(condition)}`
      );
    }

    if (isUndefined(this.constraints.checks)) {
      this.constraints.checks = [];
    }

    this.constraints.checks.push(condition);
    return this;
  }

  /**
   * Creates an index for the column.
   *
   * An index improves the speed of data retrieval operations on a database table.
   * It allows the database engine to find and access data more efficiently.
   *
   * @returns `MegaColumn` The MegaColumn instance with the index applied.
   *
   */
  public index(): MegaColumn {
    this.constraints.index = true;
    return this;
  }

  /**
   * Creates a `BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY` column.
   *
   * This column stores unique integer values that automatically increment with each new row,
   * ensuring that each record in the table has a unique identifier.
   *
   * @note This method is a shortcut for: `bigInt().unsigned().autoIncrement().primaryKey()`.
   *
   * @warning Adding `notNull()` and `unique()` to this method is not recommended
   * because the primary key constraint already enforces these properties.
   * Explicitly adding them can lead to redundancy and make the schema definition
   * less clear. It is best to rely on the primary key behavior to ensure
   * uniqueness and non-nullability.
   *
   */
  public pk(): MegaColumn {
    this.bigInt().unsigned().autoIncrement().primaryKey();
    return this;
  }

  /**
   * Creates a `BIGINT UNSIGNED FOREIGN KEY` column.
   * This column is used to store references to primary keys in other tables.
   *
   * @note This method is a short-cut for: `bigInt().unsigned().foreignKey()`.
   * @note You must call `ref()` to specify the referenced table and column after defining the foreign key.
   *
   */
  public fk(): MegaColumn {
    this.bigInt().unsigned().foreignKey();
    return this;
  }

  /**
   * Creates a column for storing IP addresses.
   * This column stores IP addresses as binary data, supporting both IPv4 and IPv6.
   *
   */
  public ip(): MegaColumn {
    this.varChar(39);
    return this;
  }

  /**
   * Creates a column for storing UUIDs.
   * This column stores UUIDs as 36-character strings.
   *
   */
  public uuid(): MegaColumn {
    this.varChar(36);
    return this;
  }

  // ______________________________ ABSTRACT

  /**
   * Defines a `TINYINT` column, which stores a very small integer value.
   * @returns `MegaColumn` column instance.
   */
  public abstract tinyInt(): MegaColumn;

  /**
   * Defines a `SMALLINT` column, which stores a small integer value.
   * @returns `MegaColumn` column instance.
   */
  public abstract smallInt(): MegaColumn;

  /**
   * Defines a `MEDIUMINT` column, which stores a medium-sized integer value.
   * @returns `MegaColumn` column instance.
   */
  public abstract mediumInt(): MegaColumn;

  /**
   * Defines an `INT` column, which stores a standard integer value.
   * @returns `MegaColumn` column instance.
   */
  public abstract int(): MegaColumn;

  /**
   * Defines a `BIGINT` column, which stores a large integer value.
   * @returns `MegaColumn` column instance.
   */
  public abstract bigInt(): MegaColumn;

  /**
   * Defines a `FLOAT` column, which stores a floating-point number.
   * @returns `MegaColumn` column instance.
   */
  public abstract float(): MegaColumn;

  /**
   * Defines a `DOUBLE` column, which stores a double-precision floating-point number.
   * @returns `MegaColumn` column instance.
   */
  public abstract double(): MegaColumn;

  /**
   * Defines a `DECIMAL` column, which stores a fixed-point number with specified precision and scale.
   * @param total - The total number of digits.
   * @param places - The number of digits to the right of the decimal point.
   * @returns `MegaColumn` column instance.
   */
  public abstract decimal(total: number, places: number): MegaColumn;

  /**
   * Defines a `CHAR` column, which stores a fixed-length string.
   * @param length - The length of the string.
   * @returns `MegaColumn` column instance.
   */
  public abstract char(length: number): MegaColumn;

  /**
   * Defines a `VARCHAR` column, which stores a variable-length string.
   * @param length - The maximum length of the string.
   * @returns `MegaColumn` column instance.
   */
  public abstract varChar(length?: number): MegaColumn;

  /**
   * Defines a `TINYTEXT` column, which stores a very small text value.
   * @returns `MegaColumn` column instance.
   */
  public abstract tinyText(): MegaColumn;

  /**
   * Defines a `MEDIUMTEXT` column, which stores a medium-sized text value.
   * @returns `MegaColumn` column instance.
   */
  public abstract mediumText(): MegaColumn;

  /**
   * Defines a `TEXT` column, which stores a standard text value.
   * @returns `MegaColumn` column instance.
   */
  public abstract text(): MegaColumn;

  /**
   * Defines a `LONGTEXT` column, which stores a large text value.
   * @returns `MegaColumn` column instance.
   */
  public abstract longText(): MegaColumn;

  /**
   * Defines a `BOOLEAN` column, which stores a true or false value.
   * @returns `MegaColumn` column instance.
   */
  public abstract boolean(): MegaColumn;

  /**
   * Defines a `DATE` column, which stores a date value.
   * @returns `MegaColumn` column instance.
   */
  public abstract date(): MegaColumn;

  /**
   * Defines a `DATETIME` column, which stores both date and time values.
   * @returns `MegaColumn` column instance.
   */
  public abstract datetime(): MegaColumn;

  /**
   * Defines a `TIMESTAMP` column, which stores a timestamp value.
   * @returns `MegaColumn` column instance.
   */
  public abstract timestamp(): MegaColumn;

  /**
   * Defines a `TIME` column, which stores a time value.
   * @returns `MegaColumn` column instance.
   */
  public abstract time(): MegaColumn;

  /**
   * Defines a `YEAR` column, which stores a year value.
   * @returns `MegaColumn` column instance.
   */
  public abstract year(): MegaColumn;

  /**
   * Defines a `JSON` column, which stores JSON data.
   * @returns `MegaColumn` column instance.
   */
  public abstract json(): MegaColumn;

  /**
   * Defines an `ENUM` column, which stores one of a predefined set of values.
   * @param values - The allowed values for the column.
   * @returns `MegaColumn` column instance.
   */
  public abstract enum(...values: Array<string>): MegaColumn;
}
