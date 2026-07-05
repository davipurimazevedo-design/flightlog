"""Testes do endpoint /aircraft/"""


def test_list_aircraft_empty(client):
    r = client.get("/aircraft/")
    assert r.status_code == 200
    assert r.json() == []


def test_create_aircraft(client):
    r = client.post("/aircraft/", json={"registration": "PT-ABC", "model": "Cessna 172", "category": "SEP"})
    assert r.status_code == 201
    data = r.json()
    assert data["registration"] == "PT-ABC"
    assert data["model"] == "Cessna 172"
    assert data["category"] == "SEP"
    assert "id" in data


def test_create_aircraft_normaliza_maiusculo(client):
    """Registro deve ser salvo em maiúsculo independente do que foi enviado."""
    r = client.post("/aircraft/", json={"registration": "pr-xyz", "model": "Piper", "category": "SEP"})
    assert r.status_code == 201
    assert r.json()["registration"] == "PR-XYZ"


def test_create_aircraft_duplicado_retorna_400(client):
    client.post("/aircraft/", json={"registration": "PT-DUP", "model": "Cessna", "category": "SEP"})
    r = client.post("/aircraft/", json={"registration": "PT-DUP", "model": "Cessna", "category": "SEP"})
    assert r.status_code == 400


def test_update_aircraft(client):
    aircraft_id = client.post(
        "/aircraft/", json={"registration": "PT-UPD", "model": "Old Model", "category": "SEP"}
    ).json()["id"]
    r = client.put(f"/aircraft/{aircraft_id}", json={"registration": "PT-UPD", "model": "New Model", "category": "MEP"})
    assert r.status_code == 200
    assert r.json()["model"] == "New Model"
    assert r.json()["category"] == "MEP"


def test_update_aircraft_inexistente_retorna_404(client):
    r = client.put("/aircraft/9999", json={"registration": "XX-XX", "model": "X", "category": "SEP"})
    assert r.status_code == 404


def test_delete_aircraft(client):
    aircraft_id = client.post(
        "/aircraft/", json={"registration": "PT-DEL", "model": "Cessna", "category": "SEP"}
    ).json()["id"]
    r = client.delete(f"/aircraft/{aircraft_id}")
    assert r.status_code == 204

    ids = [a["id"] for a in client.get("/aircraft/").json()]
    assert aircraft_id not in ids


def test_delete_aircraft_inexistente_retorna_404(client):
    r = client.delete("/aircraft/9999")
    assert r.status_code == 404


def test_create_aircraft_matricula_vazia_retorna_422(client):
    for body in (
        {"registration": "", "model": "Cessna", "category": "SEP"},
        {"registration": "   ", "model": "Cessna", "category": "SEP"},
        {"registration": "PT-OK", "model": "", "category": "SEP"},
    ):
        assert client.post("/aircraft/", json=body).status_code == 422, f"aceitou {body}"


def test_delete_aircraft_com_voos_retorna_409(client_with_seed, sample_flight_payload):
    """Não deixa apagar aeronave com voos (preserva histórico) — 409 com contagem."""
    client, seed = client_with_seed
    client.post("/flights/", json=sample_flight_payload)
    r = client.delete(f"/aircraft/{seed['aircraft'].id}")
    assert r.status_code == 409
    assert "voo" in r.json()["detail"].lower()
    # A aeronave continua existindo (não foi removida).
    ids = [a["id"] for a in client.get("/aircraft/").json()]
    assert seed["aircraft"].id in ids


def test_delete_aircraft_sem_voos_ainda_funciona(client):
    """Sem voos vinculados, a exclusão segue retornando 204."""
    aircraft_id = client.post(
        "/aircraft/", json={"registration": "PT-FREE", "model": "Cessna", "category": "SEP"}
    ).json()["id"]
    assert client.delete(f"/aircraft/{aircraft_id}").status_code == 204
