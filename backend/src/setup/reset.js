require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const mongoose = require('mongoose');
mongoose.connect(process.env.DATABASE);

async function deleteData() {
  const Admin = require('../models/coreModels/Admin');
  const AdminPassword = require('../models/coreModels/AdminPassword');
  const Setting = require('../models/coreModels/Setting');
  // [Product Brain Lab / BUG-001] Taxes e PaymentMode removidos pelo upstream (3518aee2).

  await Admin.deleteMany();
  await AdminPassword.deleteMany();
  console.log('👍 Admin Deleted. To setup demo admin data, run\n\n\t npm run setup\n\n');
  await Setting.deleteMany();
  console.log('👍 Setting Deleted. To setup Setting data, run\n\n\t npm run setup\n\n');

  process.exit();
}

deleteData();
