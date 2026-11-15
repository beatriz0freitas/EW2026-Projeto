const test = require('node:test')
const assert = require('node:assert/strict')

const { canViewResource, visibilityQuery } = require('../lib/resourceAccess')

// Mock resources for testing
const mockResources = [
	{
		_id: '663e00000000000000000001',
		metadata: { resource: { visibilidade: 'publico', titulo: 'Recurso Público 1', tema: 'Sistemas Distribuídos' } },
		produtor: 'user1',
	},
	{
		_id: '663e00000000000000000002',
		metadata: { resource: { visibilidade: 'publico', titulo: 'Recurso Público 2', tema: 'Segurança' } },
		produtor: 'user2',
	},
	{
		_id: '663e00000000000000000003',
		metadata: { resource: { visibilidade: 'privado', titulo: 'Recurso Privado do User1', tema: 'Arquitetura' } },
		produtor: 'user1',
	},
	{
		_id: '663e00000000000000000004',
		metadata: { resource: { visibilidade: 'privado', título: 'Recurso Privado do User2', tema: 'Redes' } },
		produtor: 'user2',
	},
]

// Test visibilityQuery function
test('visibilityQuery returns correct queries for different user roles', () => {
	// Anonymous user - only public resources
	assert.deepEqual(visibilityQuery(null), { 'metadata.resource.visibilidade': 'publico' })

	// Admin user - all resources
	assert.deepEqual(visibilityQuery({ role: 'admin', sub: 'admin1' }), {})

	// Regular user - public OR their own resources
	assert.deepEqual(visibilityQuery({ role: 'produtor', sub: 'user1' }), {
		$or: [{ 'metadata.resource.visibilidade': 'publico' }, { produtor: 'user1' }],
	})
})

test('canViewResource correctly filters by visibility', () => {
	const publicResource = { metadata: { resource: { visibilidade: 'publico' } }, produtor: 'user1' }
	const privateResource = { metadata: { resource: { visibilidade: 'privado' } }, produtor: 'user1' }

	// Anonymous can see public
	assert.equal(canViewResource(publicResource, null), true)
	// Anonymous cannot see private
	assert.equal(canViewResource(privateResource, null), false)

	// Producer can see their own private resources
	assert.equal(canViewResource(privateResource, { sub: 'user1', role: 'produtor' }), true)
	// Producer cannot see others' private resources
	assert.equal(canViewResource(privateResource, { sub: 'user2', role: 'produtor' }), false)

	// Admin can see everything
	assert.equal(canViewResource(privateResource, { sub: 'admin', role: 'admin' }), true)
})

test('ACL logic: anonymous user can only access public resources', () => {
	const user = null
	const query = visibilityQuery(user)
	
	// Should only allow public resources
	assert.deepEqual(query, { 'metadata.resource.visibilidade': 'publico' })
	
	// Filter mock resources
	const matchingResources = mockResources.filter(r => r.metadata.resource.visibilidade === 'publico')
	assert.equal(matchingResources.length, 2)
	assert.ok(matchingResources.every(r => r.metadata.resource.visibilidade === 'publico'))
})

test('ACL logic: authenticated user can access public and their own private resources', () => {
	const user = { sub: 'user1', role: 'produtor' }
	const query = visibilityQuery(user)
	
	// Should allow public OR produced by user1
	assert.deepEqual(query, {
		$or: [{ 'metadata.resource.visibilidade': 'publico' }, { produtor: 'user1' }],
	})
	
	// Filter mock resources
	const matchingResources = mockResources.filter(
		r => r.metadata.resource.visibilidade === 'publico' || r.produtor === 'user1'
	)
	assert.equal(matchingResources.length, 3) // 2 public + 1 private from user1
})

test('ACL logic: admin user can access all resources', () => {
	const user = { sub: 'admin', role: 'admin' }
	const query = visibilityQuery(user)
	
	// Should allow all resources
	assert.deepEqual(query, {})
	
	// All resources should match
	assert.equal(mockResources.length, 4)
})

test('ACL validation: canViewResource returns correct results for all combinations', () => {
	const testCases = [
		// [resource, user, expected, description]
		[{ metadata: { resource: { visibilidade: 'publico' } }, produtor: 'user1' }, null, true, 'public resource, anonymous user'],
		[{ metadata: { resource: { visibilidade: 'publico' } }, produtor: 'user1' }, { sub: 'user2' }, true, 'public resource, different user'],
		[{ metadata: { resource: { visibilidade: 'publico' } }, produtor: 'user1' }, { sub: 'admin', role: 'admin' }, true, 'public resource, admin'],
		[{ metadata: { resource: { visibilidade: 'privado' } }, produtor: 'user1' }, null, false, 'private resource, anonymous user'],
		[{ metadata: { resource: { visibilidade: 'privado' } }, produtor: 'user1' }, { sub: 'user2' }, false, 'private resource, different user'],
		[{ metadata: { resource: { visibilidade: 'privado' } }, produtor: 'user1' }, { sub: 'user1' }, true, 'private resource, owner'],
		[{ metadata: { resource: { visibilidade: 'privado' } }, produtor: 'user1' }, { sub: 'admin', role: 'admin' }, true, 'private resource, admin'],
	]

	testCases.forEach(([resource, user, expected, description]) => {
		const result = canViewResource(resource, user)
		assert.equal(result, expected, `Failed: ${description} (expected ${expected}, got ${result})`)
	})
})

test('ACL: resource without metadata defaults to private', () => {
	const resource = { produtor: 'user1' } // No metadata
	assert.equal(canViewResource(resource, null), false)
	assert.equal(canViewResource(resource, { sub: 'user1' }), true)
	assert.equal(canViewResource(resource, { sub: 'admin', role: 'admin' }), true)
})

test('ACL: resource with empty visibilidade defaults to private', () => {
	const resource = { metadata: { resource: {} }, produtor: 'user1' }
	assert.equal(canViewResource(resource, null), false)
	assert.equal(canViewResource(resource, { sub: 'user1' }), true)
})

test('ACL: ensures no private resources leak to unauthorized users', () => {
	const privateResources = mockResources.filter(r => r.metadata.resource.visibilidade === 'privado')
	const user2 = { sub: 'user2', role: 'produtor' }
	
	privateResources.forEach(resource => {
		if (resource.produtor !== 'user2') {
			assert.equal(
				canViewResource(resource, user2),
				false,
				`Private resource ${resource._id} from ${resource.produtor} should not be visible to user2`
			)
		}
	})
})

test('ACL: ensures all public resources are visible to everyone', () => {
	const publicResources = mockResources.filter(r => r.metadata.resource.visibilidade === 'publico')
	const testUsers = [
		null,
		{ sub: 'user1', role: 'produtor' },
		{ sub: 'user2', role: 'produtor' },
		{ sub: 'admin', role: 'admin' },
	]
	
	publicResources.forEach(resource => {
		testUsers.forEach(user => {
			assert.equal(
				canViewResource(resource, user),
				true,
				`Public resource ${resource._id} should be visible to ${user ? user.sub : 'anonymous'}`
			)
		})
	})
})
