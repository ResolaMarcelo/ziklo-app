const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const u = await prisma.user.findUnique({
    where: { email: 'marceloresola04@gmail.com' },
    include: { shops: true },
  });

  if (!u) {
    console.log('❌ Usuario NO encontrado con ese email');
    return;
  }

  console.log('✅ Usuario encontrado:');
  console.log('   Email:      ', u.email);
  console.log('   Rol:        ', u.role);
  console.log('   Verificado: ', u.emailVerified);
  console.log('   Google:     ', u.googleId ? 'sí' : 'no');
  console.log('   Tiendas:    ', u.shops.length ? u.shops.map(s => s.shopDomain).join(', ') : 'ninguna');
}

main().catch(console.error).finally(() => prisma.$disconnect());
