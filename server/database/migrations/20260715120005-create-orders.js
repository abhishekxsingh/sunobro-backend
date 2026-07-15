module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('orders', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      reference: { type: Sequelize.STRING, allowNull: false, unique: true },
      customer_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'customers', key: 'id' },
        onDelete: 'SET NULL',
      },
      status: {
        type: Sequelize.ENUM('pending', 'paid', 'shipped', 'delivered', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      subtotal: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      shipping_fee: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      tax: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      total: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'INR' },
      shipping_first_name: { type: Sequelize.STRING, allowNull: false },
      shipping_last_name: { type: Sequelize.STRING, allowNull: false },
      shipping_street: { type: Sequelize.STRING, allowNull: false },
      shipping_city: { type: Sequelize.STRING, allowNull: false },
      shipping_postal_code: { type: Sequelize.STRING, allowNull: false },
      shipping_country: { type: Sequelize.STRING, allowNull: false },
      destination: { type: Sequelize.STRING, allowNull: true },
      estimated_arrival: { type: Sequelize.STRING, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('orders', ['customer_id']);
    await queryInterface.addIndex('orders', ['status']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('orders');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_orders_status";');
  },
};
