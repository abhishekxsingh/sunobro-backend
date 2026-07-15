module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('product_variants', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      product_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'products', key: 'id' },
        onDelete: 'CASCADE',
      },
      size: { type: Sequelize.STRING, allowNull: false },
      color: { type: Sequelize.STRING, allowNull: false },
      sku: { type: Sequelize.STRING, allowNull: false, unique: true },
      stock: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      price: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
      qikink_sku: { type: Sequelize.STRING, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('product_variants', ['product_id']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('product_variants');
  },
};
