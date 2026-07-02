"""
Testes do endpoint /flights/

Cobre:
- CRUD básico
- Validações (aeronave/aeroporto inexistente)
- Filtros
- Endpoints do bot: pending-review e mark-reviewed
- Stats e count
"""


# ── CRUD ──────────────────────────────────────────────────────────────────────

def test_criar_voo(client_with_seed, sample_flight_payload):
    client, _ = client_with_seed
    r = client.post("/flights/", json=sample_flight_payload)
    assert r.status_code == 201
    data = r.json()
    assert data["origin_icao"] == "SBPA"
    assert data["destination_icao"] == "SBPF"
    assert data["source"] == "app"
    assert data["needs_review"] is False
    assert "id" in data


def test_criar_voo_aeroporto_inexistente_retorna_404(client_with_seed, seed):
    client, seed = client_with_seed
    payload = {
        "date": "2026-06-01T10:00:00Z",
        "origin_icao": "XXXX",
        "destination_icao": "SBPF",
        "aircraft_id": seed["aircraft"].id,
        "departure_time": "2026-06-01T10:30:00Z",
        "arrival_time": "2026-06-01T11:15:00Z",
    }
    assert client.post("/flights/", json=payload).status_code == 404


def test_criar_voo_aeronave_inexistente_retorna_404(client_with_seed):
    client, _ = client_with_seed
    payload = {
        "date": "2026-06-01T10:00:00Z",
        "origin_icao": "SBPA",
        "destination_icao": "SBPF",
        "aircraft_id": 9999,
        "departure_time": "2026-06-01T10:30:00Z",
        "arrival_time": "2026-06-01T11:15:00Z",
    }
    assert client.post("/flights/", json=payload).status_code == 404


def test_criar_voo_icao_invalido_retorna_422(client_with_seed, sample_flight_payload):
    """ICAO deve ter exatamente 4 letras — '1234', 'XX', 'SBBRX' são rejeitados."""
    client, _ = client_with_seed
    for ruim in ("1234", "XX", "SBBRX", "SB1R"):
        payload = {**sample_flight_payload, "origin_icao": ruim}
        assert client.post("/flights/", json=payload).status_code == 422, f"aceitou ICAO '{ruim}'"


def test_criar_voo_mesmo_aeroporto_permitido(client_with_seed, sample_flight_payload):
    """Voo local (origem == destino) é VÁLIDO — treinamento decola e pousa no mesmo lugar."""
    client, _ = client_with_seed
    payload = {**sample_flight_payload, "destination_icao": sample_flight_payload["origin_icao"]}
    assert client.post("/flights/", json=payload).status_code == 201


def test_criar_voo_pouso_antes_da_decolagem_retorna_400(client_with_seed, sample_flight_payload):
    """Pouso <= decolagem é inválido (voo de meia-noite já chega ajustado pelo cliente)."""
    client, _ = client_with_seed
    payload = {
        **sample_flight_payload,
        "departure_time": "2026-06-01T11:15:00Z",
        "arrival_time":   "2026-06-01T10:30:00Z",
    }
    assert client.post("/flights/", json=payload).status_code == 400


def test_criar_voo_pouso_igual_decolagem_retorna_400(client_with_seed, sample_flight_payload):
    client, _ = client_with_seed
    payload = {
        **sample_flight_payload,
        "departure_time": "2026-06-01T10:30:00Z",
        "arrival_time":   "2026-06-01T10:30:00Z",
    }
    assert client.post("/flights/", json=payload).status_code == 400


def test_buscar_voo_por_id(client_with_seed, sample_flight_payload):
    client, _ = client_with_seed
    flight_id = client.post("/flights/", json=sample_flight_payload).json()["id"]
    r = client.get(f"/flights/{flight_id}")
    assert r.status_code == 200
    assert r.json()["id"] == flight_id


def test_buscar_voo_inexistente_retorna_404(client_with_seed):
    client, _ = client_with_seed
    assert client.get("/flights/9999").status_code == 404


def test_listar_voos(client_with_seed, sample_flight_payload):
    client, _ = client_with_seed
    client.post("/flights/", json=sample_flight_payload)
    r = client.get("/flights/")
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_atualizar_voo(client_with_seed, sample_flight_payload):
    client, _ = client_with_seed
    flight_id = client.post("/flights/", json=sample_flight_payload).json()["id"]
    r = client.put(f"/flights/{flight_id}", json={**sample_flight_payload, "remarks": "Atualizado"})
    assert r.status_code == 200
    assert r.json()["remarks"] == "Atualizado"


def test_atualizar_voo_inexistente_retorna_404(client_with_seed, sample_flight_payload):
    client, _ = client_with_seed
    assert client.put("/flights/9999", json=sample_flight_payload).status_code == 404


def test_deletar_voo(client_with_seed, sample_flight_payload):
    client, _ = client_with_seed
    flight_id = client.post("/flights/", json=sample_flight_payload).json()["id"]
    assert client.delete(f"/flights/{flight_id}").status_code == 204
    assert client.get(f"/flights/{flight_id}").status_code == 404


def test_deletar_voo_inexistente_retorna_404(client_with_seed):
    client, _ = client_with_seed
    assert client.delete("/flights/9999").status_code == 404


# ── Endpoints do bot Telegram ─────────────────────────────────────────────────

def test_pending_review_vazio(client_with_seed):
    client, _ = client_with_seed
    r = client.get("/flights/pending-review")
    assert r.status_code == 200
    assert r.json() == []


def test_pending_review_retorna_voos_do_bot(client_with_seed, sample_flight_payload):
    """Voo com needs_review=True deve aparecer no pending-review."""
    client, _ = client_with_seed
    payload = {**sample_flight_payload, "source": "telegram", "needs_review": True}
    client.post("/flights/", json=payload)

    r = client.get("/flights/pending-review")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["needs_review"] is True
    assert r.json()[0]["source"] == "telegram"


def test_pending_review_nao_retorna_voos_ja_revisados(client_with_seed, sample_flight_payload):
    client, _ = client_with_seed
    payload = {**sample_flight_payload, "source": "telegram", "needs_review": False}
    client.post("/flights/", json=payload)
    assert client.get("/flights/pending-review").json() == []


def test_mark_reviewed(client_with_seed, sample_flight_payload):
    """Depois de mark-reviewed, needs_review deve ser False e sair do pending-review."""
    client, _ = client_with_seed
    payload = {**sample_flight_payload, "source": "telegram", "needs_review": True}
    flight_id = client.post("/flights/", json=payload).json()["id"]

    r = client.patch(f"/flights/{flight_id}/mark-reviewed")
    assert r.status_code == 200
    assert r.json()["needs_review"] is False

    pending = client.get("/flights/pending-review").json()
    assert all(f["id"] != flight_id for f in pending)


def test_mark_reviewed_inexistente_retorna_404(client_with_seed):
    client, _ = client_with_seed
    assert client.patch("/flights/9999/mark-reviewed").status_code == 404


# ── Stats e count ─────────────────────────────────────────────────────────────

def test_stats_sem_voos(client_with_seed):
    client, _ = client_with_seed
    r = client.get("/flights/stats")
    assert r.status_code == 200
    data = r.json()
    assert data["total_flights"] == 0
    assert data["total_block_hours"] == 0


def test_stats_com_voo(client_with_seed, sample_flight_payload):
    client, _ = client_with_seed
    client.post("/flights/", json=sample_flight_payload)
    data = client.get("/flights/stats").json()
    assert data["total_flights"] == 1
    assert data["total_block_hours"] > 0      # 45 min = 0.75h
    assert data["unique_airports"] == 2
    assert data["unique_aircraft"] == 1


def test_count_retorna_total_e_minutos(client_with_seed, sample_flight_payload):
    client, _ = client_with_seed
    client.post("/flights/", json=sample_flight_payload)
    data = client.get("/flights/count").json()
    assert data["total"] == 1
    assert data["total_minutes"] == 45        # 10:30 → 11:15 = 45 min


# ── Filtros ───────────────────────────────────────────────────────────────────

def test_filtro_por_busca_icao(client_with_seed, sample_flight_payload):
    client, _ = client_with_seed
    client.post("/flights/", json=sample_flight_payload)
    r = client.get("/flights/?search=SBPA")
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_filtro_por_aeronave_id(client_with_seed, sample_flight_payload, seed):
    client, seed = client_with_seed
    client.post("/flights/", json=sample_flight_payload)
    r = client.get(f"/flights/?aircraft_id={seed['aircraft'].id}")
    assert r.status_code == 200
    assert all(f["aircraft_id"] == seed["aircraft"].id for f in r.json())
