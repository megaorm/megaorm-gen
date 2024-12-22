import { MegaColumn } from './schema/MegaColumn';
import { MySQLColumn } from './schema/MySQLColumn';
import { SQLiteColumn } from './schema/SQLiteColumn';
import { PostgreSQLColumn } from './schema/PostgreSQLColumn';

import {
  isChildOf,
  isDefined,
  isEmptyArr,
  isFullStr,
  isSnakeCase,
  isStr,
  isUndefined,
} from '@megaorm/test';

import { MegaBuilder } from '@megaorm/builder';
import { isMySQL, isPostgreSQL, isSQLite } from '@megaorm/utils';

/**
 * Custom error class for handling generator-related errors in the MegaGenerator system.
 */
export class MegaGeneratorError extends Error {}

/**
 * Executes an array of SQL queries sequentially using the provided builder.
 * Each query is executed one after the other, and any errors encountered
 * during execution will cause the promise to reject.
 *
 * @param queries - An array of SQL query strings to be executed.
 * @param builder - An instance of `MegaBuilder` used to execute the queries.
 *
 * @returns Promise resolves when all queries have been executed, or rejects if any query fails.
 */
function execute(queries: Array<string>, builder: MegaBuilder): Promise<void> {
  return new Promise((resolve, reject) => {
    const exec = (index: number = 0): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (isUndefined(queries[index])) return resolve();

        return builder
          .raw(queries[index])
          .then(() => exec(index + 1))
          .then(resolve)
          .catch(reject);
      });
    };

    exec().then(resolve).catch(reject);
  });
}

/**
 * Constructs SQL statements for creating a table with specified columns and constraints.
 *
 * This function generates the SQL statement for creating a table based on the provided column
 * definitions and their respective constraints, including primary keys, foreign keys, unique
 * constraints, and default values. It also handles driver-specific considerations for different
 * database systems, ensuring that the correct SQL syntax is generated based on the database being used.
 *
 * @param columns An array of column definitions for the table, where each column is represented as an instance of MegaColumn containing its type, name, and constraints.
 * @param builder An instance of `MegaBuilder` that provides access to the current database connection and driver.
 * @param table The name of the table to be created.
 * @param constructor The name of the constructor invoking this function, used for error messaging.
 *
 * @returns An array containing the SQL statement for creating the table and any additional statements for creating indexes associated with the columns.
 * @throws `MegaGeneratorError` if any of the column names or types are undefined, or if constraints are misconfigured, such as using auto-increment with a non-primary key in SQLite.
 */
function resolve(
  columns: Array<MegaColumn>,
  builder: MegaBuilder,
  table: string,
  constructor: string
): Array<string> {
  const driver = builder.get.connection().driver;
  const statements: Array<string> = [];
  const constraints: Array<string> = [];
  const indexes: Array<string> = [];

  for (const column of columns) {
    const col = {
      type: column.get.type(),
      constraints: column.get.constraints(),
      name: column.get.name(),
    };

    if (!isFullStr(col.name)) {
      throw new MegaGeneratorError(`Undefined column name in: ${constructor}`);
    }

    if (!isStr(col.type)) {
      throw new MegaGeneratorError(`Undefined column type in: ${constructor}`);
    }

    // PostgreSQL uses BIGSERIAL for auto-incrementing columns
    if (isPostgreSQL(driver) && col.constraints.autoIncrement) {
      col.type = 'BIGSERIAL';
    }

    // Construct the initial SQL statement: column_name column_type
    let statement = `${col.name} ${col.type}`;

    // Handle Unsigned Constraints
    if (isDefined(col.constraints.unsigned)) {
      // SQLite || PostgreSQL: Ignore unsigned check for AUTO_INCREMENT columns
      if (isPostgreSQL(driver) || isSQLite(driver)) {
        if (isUndefined(col.constraints.autoIncrement)) {
          if (isUndefined(col.constraints.checks)) {
            col.constraints.checks = [];
          }

          // Ensure values are non-negative
          col.constraints.checks.push(`${col.name} >= 0`);
        }
      }

      // MySQL: Append UNSIGNED keyword
      else if (isMySQL(driver)) statement += ` UNSIGNED`;
    }

    // Handle Auto Increment Constraints
    if (isDefined(col.constraints.autoIncrement)) {
      if (isUndefined(col.constraints.primaryKey)) {
        throw new MegaGeneratorError(
          `Your auto-increment column '${col.name}' must be a primary key in: ${constructor}`
        );
      }

      // SQLite: Auto-increments primary keys by default
      // PostgreSQL: Handled earlier in the code by replacing the type with BIGSERIAL
      // MySQL: Append AUTO_INCREMENT keyword
      if (isMySQL(driver)) statement += ` AUTO_INCREMENT`;
    }

    // Handle Not Null Constraints
    if (isDefined(col.constraints.notNull)) {
      statement += ` NOT NULL`;
    }

    // Handle Default Value Constraints
    if (isDefined(col.constraints.default)) {
      statement += ` DEFAULT ${col.constraints.default}`;
    }

    // Add the constructed statement to the list of statements
    statements.push(statement);

    // Primary keys
    if (isDefined(col.constraints.primaryKey)) {
      constraints.push(
        `CONSTRAINT pk_${table}_${col.name} PRIMARY KEY (${col.name})`
      );
    }

    // Foreign keys
    if (isDefined(col.constraints.foreignKey)) {
      const fk = col.constraints.foreignKey;

      if (isUndefined(fk.references)) {
        throw new MegaGeneratorError(
          `Undefined foreign key reference in: ${constructor}`
        );
      }

      const onDelete = isDefined(fk.onDelete)
        ? ` ON DELETE ${fk.onDelete.description}`
        : '';

      const onUpdate = isDefined(fk.onUpdate)
        ? ` ON UPDATE ${fk.onUpdate.description}`
        : '';

      constraints.push(
        `CONSTRAINT fk_${table}_${col.name} FOREIGN KEY (${col.name}) REFERENCES ${fk.references.table}(${fk.references.column})${onDelete}${onUpdate}`
      );
    }

    // Checks
    if (isDefined(col.constraints.checks)) {
      col.constraints.checks.forEach((condition, index) => {
        constraints.push(
          `CONSTRAINT check_${table}_${col.name}_${index} CHECK (${condition})`
        );
      });
    }

    // Unique
    if (isDefined(col.constraints.unique)) {
      constraints.push(
        `CONSTRAINT unique_${table}_${col.name} UNIQUE (${col.name})`
      );
    }

    // indexes are created after the table is created
    if (isDefined(col.constraints.index)) {
      indexes.push(
        `CREATE INDEX index_${table}_${col.name} ON ${table}(${col.name});`
      );
    }
  }

  const cols = statements.join(', ');
  const cons = constraints.length > 0 ? `, ${constraints.join(', ')}` : '';
  const statement = `CREATE TABLE ${table} (${cols}${cons});`;

  return [statement, ...indexes];
}

/**
 * Interface for the `get` property, providing access to the builder instance
 * and table name for the generator.
 *
 * @interface Getter
 */
interface Getter {
  /**
   * Retrieves the builder instance used for executing database queries.
   *
   * @returns `MegaBuilder` instance if properly set and valid.
   * @throws `MegaGeneratorError` if the builder is not correctly set.
   */
  builder: () => MegaBuilder;

  /**
   * Retrieves the table name associated with this generator.
   *
   * @returns Table name as a string in `snake_case`.
   * @throws `MegaGeneratorError` if the table name is not in `snake_case` format.
   */
  table: () => string;
}

/**
 * Interface for the `set` property, allowing assignment of the table name
 * and builder instance to the generator.
 *
 * @interface Setter
 */
interface Setter {
  /**
   * Sets the table name for the generator.
   *
   * @param table - Name of the table in `snake_case`.
   * @returns The current MegaGenerator instance.
   * @throws `MegaGeneratorError` if the table name is not in `snake_case`.
   */
  table: (table: string) => MegaGenerator;

  /**
   * Sets the builder instance for the generator.
   *
   * @param builder - Instance of `MegaBuilder` for executing queries.
   * @returns The current MegaGenerator instance.
   * @throws `MegaGeneratorError` if the builder is not a valid `MegaBuilder`.
   */
  builder: (builder: MegaBuilder) => MegaGenerator;
}

/**
 * Represents an abstract generator for creating and dropping database tables.
 * The `MegaGenerator` class allows users to define their table schemas and
 * provides methods to create or drop the corresponding tables in the database.
 * Each subclass of `MegaGenerator` represents a specific table and can be used
 * to manage that table's schema effectively.
 *
 * @abstract
 * @class MegaGenerator
 *
 * @method `get.table()` - Retrieves the table name e.g: `users`.
 * @method `get.builder()` - Retrieves the builder instance.
 * @method `set.table(table)` - Sets the table name.
 * @method `set.builder(builder)` - Sets the builder instance.
 * @method `column(name)` - Creates a new column based on the driver.
 * @method `schema(...columns)` - Defines the schema for the table with specified columns.
 * @method `drop()` - Drops the table from the database.
 * @method `create()` - Creates the table, implementation should be provided in child classes.
 *
 * @throws `MegaGeneratorError` if the constructor is called directly
 *
 */
export abstract class MegaGenerator {
  /**
   * The name of the database table managed by this generator.
   */
  private table: string;

  /**
   * The builder instance used to execute database queries.
   */
  private builder: MegaBuilder;

  /**
   * Provides access to the table name and builder instance.
   */
  public get: Getter = {
    builder: (): MegaBuilder => {
      if (!isChildOf(this.builder, MegaBuilder)) {
        throw new MegaGeneratorError(
          `Invalid builder in: ${this.constructor.name}`
        );
      }

      return this.builder;
    },
    table: (): string => {
      if (!isSnakeCase(this.table)) {
        throw new MegaGeneratorError(
          `Invalid table name in: ${this.constructor.name}`
        );
      }

      return this.table;
    },
  };

  /**
   * Allows setting the table name and builder instance.
   */
  public set: Setter = {
    table: (table: string): this => {
      if (!isSnakeCase(table)) {
        throw new MegaGeneratorError(
          `Invalid table name in: ${this.constructor.name}`
        );
      }

      this.table = table;
      return this;
    },
    builder: (builder: MegaBuilder): this => {
      if (!isChildOf(builder, MegaBuilder)) {
        throw new MegaGeneratorError(
          `Invalid builder in: ${this.constructor.name}`
        );
      }

      this.builder = builder;
      return this;
    },
  };

  /**
   * Initializes a new instance of the MegaGenerator class.
   * This is an abstract class and cannot be instantiated directly.
   *
   * @throws `MegaGeneratorError` if an attempt is made to instantiate `MegaGenerator` directly.
   *
   */
  constructor() {
    if (new.target === MegaGenerator) {
      throw new MegaGeneratorError(
        'Cannot construct MegaGenerator instances directly'
      );
    }
  }

  /**
   * Creates a new column based on the specified database driver.
   * All columns share the same set of methods, but specifying the type allows for richer,
   * more detailed documentation that is specific to the expected column type.
   *
   * @template T - The specific type of the column being created. Defaults to `MegaColumn`.
   * @param name - The name of the column to create.
   * @returns A column object based on your driver.
   * @throws `MegaGeneratorError` - Throws an error if the driver is invalid or unsupported.
   *
   */
  protected column<T extends MegaColumn = MegaColumn>(name: string): T {
    const driver = this.get.builder().get.connection().driver;

    if (isMySQL(driver)) return new MySQLColumn(name) as T;
    if (isSQLite(driver)) return new SQLiteColumn(name) as T;
    if (isPostgreSQL(driver)) return new PostgreSQLColumn(name) as T;

    throw new MegaGeneratorError(`Invalid driver in: ${this.constructor.name}`);
  }

  /**
   * Creates a table schema with the given columns.
   *
   * @param columns - An array of MegaColumn instances that specify the table schema.
   * @returns Promise resolves when the table is created, or rejects if execution fails.
   * @throws `MegaGeneratorError` if the columns are invalid or incompatible with the specified driver.
   *
   */
  protected schema(...columns: Array<MegaColumn>): Promise<void> {
    return new Promise((res, rej) => {
      if (isEmptyArr(columns)) {
        return rej(
          new MegaGeneratorError(
            `Undefined schema columns in: ${this.constructor.name}`
          )
        );
      }

      const builder = this.get.builder();
      const driver = builder.get.connection().driver;

      const validator = (col: MegaColumn): boolean => {
        if (isMySQL(driver)) {
          return isChildOf(col, MySQLColumn);
        }

        if (isPostgreSQL(driver)) {
          return isChildOf(col, PostgreSQLColumn);
        }

        if (isSQLite(driver)) {
          return isChildOf(col, SQLiteColumn);
        }

        return false;
      };

      if (columns.every(validator)) {
        const queries = resolve(
          columns,
          builder,
          this.get.table(),
          this.constructor.name
        );

        return execute(queries, builder).then(res).catch(rej);
      }

      return rej(
        new MegaGeneratorError(`Invalid columns in: ${this.constructor.name}`)
      );
    });
  }

  /**
   * Creates a column for the `created_at` timestamp.
   * This method generates a column that will store the creation time of a record.
   *
   * @returns `MegaColumn` A column object representing the `created_at` timestamp.
   *
   */
  protected createdAt(): MegaColumn {
    return this.column('created_at').datetime();
  }

  /**
   * Creates a column for the `updated_at` timestamp.
   * This method generates a column that will store the last updated time of a record.
   *
   * @returns `MegaColumn` A column object representing the `updated_at` timestamp.
   *
   */
  protected updatedAt(): MegaColumn {
    return this.column('updated_at').datetime();
  }

  /**
   * Creates timestamp columns, including `created_at` and `updated_at`.
   * This method is useful for defining standard timestamp fields in a table schema.
   *
   * @returns An array containing the `created_at` and `updated_at` columns.
   *
   */
  protected timestamps(): Array<MegaColumn> {
    return [this.createdAt(), this.updatedAt()];
  }

  /**
   * Creates a primary key column.
   * This method defines a column to be used as the primary key for a table.
   * By default, the column name is `id`, but a custom name can be provided.
   *
   * @param name (Optional) The name of the primary key column. Defaults to `id` if not specified.
   * @returns `MegaColumn` A column object representing the primary key.
   *
   */
  protected primaryKey(name?: string): MegaColumn {
    name = isFullStr(name) ? name : 'id';
    return this.column(name).pk();
  }

  /**
   * Drops the associated table from the database.
   *
   * The `drop` method is implemented for you, **You do not need to override this method in subclasses.**
   *
   * @returns Resolves if the table is dropped successfully, or rejects if an error occurs.
   *
   */
  public drop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.get
        .builder()
        .raw(`DROP TABLE ${this.get.table()};`)
        .then(() => resolve())
        .catch(reject);
    });
  }

  /**
   * Creates the table schema with the specified columns.
   *
   * This method **must be implemented in subclasses**. Use `this.schema(columns)` to create a table schema with the given columns.
   *
   * If this method is not implemented, an error will be thrown with the message: `Table creation logic is missing`
   *
   * @returns Promise resolves when the table is created successfully, or rejects if an error occurs.
   * @throws `MegaGeneratorError` if incompatible column types are provided, if columns don’t match the specified driver, or if this method is not implemented in a subclass.
   *
   */
  public create(): Promise<void> {
    throw new MegaGeneratorError(
      `Table creation logic is missing in: ${this.constructor.name}`
    );
  }
}
