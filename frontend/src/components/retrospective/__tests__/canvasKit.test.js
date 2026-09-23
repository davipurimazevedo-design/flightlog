import { describe, it, expect } from 'vitest'
import { nmToKm, voltasAoMundo } from '../canvasKit'

describe('nmToKm', () => {
  it('converte pelo fator 1,852', () => {
    expect(nmToKm(1000)).toBe(1852)
  })

  it('trata ausência de distância como zero', () => {
    expect(nmToKm(0)).toBe(0)
    expect(nmToKm(undefined)).toBe(0)
    expect(nmToKm(null)).toBe(0)
  })
})

describe('voltasAoMundo', () => {
  it('formata em pt-BR com duas casas abaixo de uma volta', () => {
    expect(voltasAoMundo(9310)).toBe('0,43')
  })

  it('usa uma casa a partir de uma volta, para não poluir', () => {
    expect(voltasAoMundo(21639)).toBe('1,0')
    expect(voltasAoMundo(40000)).toBe('1,8')
  })

  // Nos primeiros segundos do vídeo o contador ainda está somando: mostrar
  // "0,00x a volta ao mundo" não informa nada, então a linha nem aparece.
  it('não devolve nada abaixo de 0,01 volta', () => {
    expect(voltasAoMundo(0)).toBeNull()
    expect(voltasAoMundo(undefined)).toBeNull()
    expect(voltasAoMundo(100)).toBeNull()
  })

  it('acende assim que passa de 0,01 volta', () => {
    expect(voltasAoMundo(250)).toBe('0,01')
  })
})
