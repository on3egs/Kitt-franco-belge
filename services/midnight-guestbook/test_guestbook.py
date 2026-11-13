import tempfile
import unittest
from uuid import uuid4
from aiohttp.test_utils import TestClient, TestServer
from guestbook import create_app


class GuestbookTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = create_app(self.temp.name)
        self.client = TestClient(TestServer(self.app))
        await self.client.start_server()
        self.admin = {"Authorization": "Bearer "+self.app["admin_token"]}

    async def asyncTearDown(self):
        await self.client.close()
        self.temp.cleanup()

    def payload(self, **kwargs):
        return {"author": "Testeur", "crew": "La scène", "message": "Un signal de test.", "visibility": "public", "request_id": str(uuid4()), **kwargs}

    async def post(self, data=None, **kwargs):
        return await self.client.post('/api/midnight/entries', json=data or self.payload(), **kwargs)

    async def test_public_comment_survives_new_connection(self):
        response = await self.post()
        self.assertEqual(response.status, 201)
        await self.client.close()
        self.app = create_app(self.temp.name)
        self.client = TestClient(TestServer(self.app))
        await self.client.start_server()
        response = await self.client.get('/api/midnight/entries')
        body = await response.json()
        self.assertEqual(body['total'], 1)
        self.assertEqual(body['entries'][0]['message'], 'Un signal de test.')
        self.assertNotIn('email', body['entries'][0])
        self.assertNotIn('ip_hash', body['entries'][0])

    async def test_private_message_never_appears_in_public_list(self):
        response = await self.post(self.payload(visibility='private', email='test@example.org'))
        body = await response.json()
        self.assertEqual(response.status, 201)
        self.assertIsNone(body['entry'])
        public = await (await self.client.get('/api/midnight/entries')).json()
        self.assertEqual(public['total'], 0)
        self.assertEqual((await self.client.get('/api/midnight/admin/entries')).status, 401)
        inbox = await (await self.client.get('/api/midnight/admin/entries', headers=self.admin)).json()
        self.assertEqual(inbox['entries'][0]['email'], 'test@example.org')

    async def test_hide_restore_does_not_publish_private_message(self):
        await self.post(self.payload(visibility='private'))
        row = (await (await self.client.get('/api/midnight/admin/entries', headers=self.admin)).json())['entries'][0]
        route = '/api/midnight/admin/entries/'+str(row['id'])
        self.assertEqual((await self.client.delete(route)).status, 401)
        self.assertEqual((await self.client.delete(route, headers=self.admin)).status, 200)
        self.assertEqual((await self.client.post(route+'/restore', headers=self.admin)).status, 200)
        public = await (await self.client.get('/api/midnight/entries')).json()
        self.assertEqual(public['total'], 0)

    async def test_hide_public_comment(self):
        response = await self.post()
        row = (await response.json())['entry']
        await self.client.delete('/api/midnight/admin/entries/'+str(row['id']), headers=self.admin)
        body = await (await self.client.get('/api/midnight/entries')).json()
        self.assertEqual(body['total'], 0)

    async def test_retry_is_idempotent(self):
        data = self.payload(author='Test\nPseudonyme')
        self.assertEqual((await self.post(data)).status, 201)
        self.assertEqual((await self.post(data)).status, 200)
        data['message'] = 'Un texte différent.'
        self.assertEqual((await self.post(data)).status, 409)
        body = await (await self.client.get('/api/midnight/entries')).json()
        self.assertEqual(body['total'], 1)

    async def test_persistent_rate_limit(self):
        for _ in range(3):
            self.assertEqual((await self.post()).status, 201)
        response = await self.post()
        self.assertEqual(response.status, 429)
        self.assertEqual(response.headers['Retry-After'], '900')

    async def test_invalid_or_spam_content_is_rejected(self):
        for overrides in ({'message': ''}, {'message': 'a'*2001}, {'author': ''}, {'email': 'wrong', 'visibility': 'private'}, {'visibility': 'invalid'}, {'website': 'spam'}, {'request_id': '../invalid/id'}, {'message': 'https://a.test https://b.test https://c.test'}):
            with self.subTest(overrides=overrides):
                self.assertEqual((await self.post(self.payload(**overrides))).status, 400)
        self.assertEqual((await self.client.post('/api/midnight/entries', json=[])).status, 400)
        self.assertEqual((await self.client.post('/api/midnight/entries', data='invalid')).status, 415)

    async def test_html_is_stored_as_text_and_public_email_discarded(self):
        text = '<img src=x onerror="alert(1)">'
        response = await self.post(self.payload(message=text, email='not-for-public@example.org'))
        self.assertEqual((await response.json())['entry']['message'], text)
        inbox = await (await self.client.get('/api/midnight/admin/entries', headers=self.admin)).json()
        self.assertEqual(inbox['entries'][0]['email'], '')

    async def test_cors_preflight_and_disallowed_origin(self):
        origin = 'https://kitt-franco-belge.be'
        response = await self.client.options('/api/midnight/entries', headers={'Origin': origin, 'Access-Control-Request-Method': 'POST'})
        self.assertEqual(response.status, 204)
        self.assertEqual(response.headers['Access-Control-Allow-Origin'], origin)
        response = await self.post(headers={'Origin': 'https://unrelated.example'})
        self.assertEqual(response.status, 403)


if __name__ == '__main__':
    unittest.main(verbosity=2)
