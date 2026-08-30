import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

export interface GameState {
  id: number;
  phase: 'lobby' | 'q' | 'reveal' | 'final';
  question_index: number;
  started_at: string | null;
}

export interface AnswerRow {
  player_name: string;
  question_index: number;
  choice: number;
  answer_time_ms: number;
}

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private client: SupabaseClient;

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  // ---- Jogadores ----
  async joinAsPlayer(name: string) {
    return this.client.from('players').insert({ name }).select();
  }

  async playerExists(name: string) {
    const { data } = await this.client
      .from('players')
      .select('name')
      .eq('name', name)
      .maybeSingle();
    return !!data;
  }

  // ---- Estado do jogo ----
  async getGameState(): Promise<GameState | null> {
    const { data } = await this.client.from('game_state').select('*').eq('id', 1).single();
    return data as GameState | null;
  }

  async setGameState(patch: Partial<GameState>) {
    return this.client.from('game_state').update(patch).eq('id', 1);
  }

  onGameStateChange(callback: (state: GameState) => void) {
    return this.client
      .channel('game_state_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_state' },
        (payload) => callback(payload.new as GameState),
      )
      .subscribe();
  }

  // ---- Respostas ----
  async submitAnswer(row: AnswerRow) {
    return this.client.from('answers').insert(row);
  }

  async hasAnswered(playerName: string, questionIndex: number) {
    const { data } = await this.client
      .from('answers')
      .select('choice')
      .eq('player_name', playerName)
      .eq('question_index', questionIndex)
      .maybeSingle();
    return data;
  }

  async getAnswersForQuestion(questionIndex: number): Promise<AnswerRow[]> {
    const { data } = await this.client
      .from('answers')
      .select('*')
      .eq('question_index', questionIndex);
    return (data || []) as AnswerRow[];
  }

  async getAllAnswers(): Promise<AnswerRow[]> {
    const { data } = await this.client.from('answers').select('*');
    return (data || []) as AnswerRow[];
  }

  onAnswersChange(callback: () => void) {
    return this.client
      .channel('answers_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'answers' }, () =>
        callback(),
      )
      .subscribe();
  }

  async getPlayers(): Promise<{ name: string }[]> {
    const { data } = await this.client.from('players').select('name');
    return (data || []) as { name: string }[];
  }

  onPlayersChange(callback: () => void) {
    return this.client
      .channel('players_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players' }, () =>
        callback(),
      )
      .subscribe();
  }

  async countPlayers(): Promise<number> {
    const { count } = await this.client.from('players').select('*', { count: 'exact', head: true });
    return count || 0;
  }

  async countAnswersForQuestion(qIndex: number): Promise<number> {
    const { count } = await this.client
      .from('answers')
      .select('*', { count: 'exact', head: true })
      .eq('question_index', qIndex);
    return count || 0;
  }

  async resetGame() {
    await this.client.from('answers').delete().neq('player_name', '');
    await this.client.from('players').delete().neq('name', '');
    await this.setGameState({ phase: 'lobby', question_index: 0, started_at: null });
  }
}
