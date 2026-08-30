import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { GameState, SupabaseService } from '../supabase.service';
import { FormsModule } from '@angular/forms';

const HOST_CODE = 'asimov';

const QUESTIONS = [
  {
    q: 'Complete: "A IA não faz o meu trabalho, ela..."',
    a: ['pensa por mim', 'acelera o que eu já faria.', 'substitui o Excel', 'faz tudo sozinha'],
    c: 1,
  },
  {
    q: 'Quem escreveu o livro "Eu, Robô"?',
    a: ['Alan Turing', 'Arthur C. Clarke', 'Isaac Asimov', 'Will Smith'],
    c: 2,
  },
  {
    q: 'Em que ano viralizou o vídeo do Will Smith comendo macarrão gerado por IA?',
    a: ['2015', '2020', '2023', '2025'],
    c: 2,
  },
  {
    q: 'Usar RAG é como dar o quê para a IA?',
    a: [
      'Mais memória RAM',
      'Um caderno de consulta com seus dados',
      'Um cérebro novo',
      'Acesso à internet',
    ],
    c: 1,
  },
  {
    q: 'Qual livro defende "aplicar pra aprender" — e está saindo de presente hoje?',
    a: ['Mindset', 'O Poder do Hábito', 'Hábitos Atômicos', 'Ultraaprendizado'],
    c: 3,
  },
];

type HostView = 'login' | 'lobby' | 'question' | 'final';

interface BoardRow {
  name: string;
  points: number;
}

@Component({
  selector: 'app-host',
  imports: [FormsModule],
  templateUrl: './host.html',
  styleUrl: './host.scss',
})
export class Host implements OnInit, OnDestroy {
  view = signal<HostView>('login');
  codeInput = signal('');
  loginError = signal('');

  playerCount = signal(0);
  currentQuestion = signal(0);
  answerCount = signal(0);
  respondedList = signal<{ name: string; answered: boolean }[]>([]);
  phase = signal<GameState['phase']>('lobby');
  board = signal<BoardRow[]>([]);

  questions = QUESTIONS;
  revealStep = signal(0); // 0 = nada revelado, 1 = só 3º, 2 = 3º e 2º, 3 = todos
  publicUrl = ''; // preenchido depois do deploy na Vercel

  private stateChannel: any;
  private answersChannel: any;
  private playersChannel: any;

  constructor(private supabase: SupabaseService) {}

  ngOnInit() {
    // não conecta em nada até o login ser confirmado
  }

  ngOnDestroy() {
    this.stateChannel?.unsubscribe();
    this.answersChannel?.unsubscribe();
    this.playersChannel?.unsubscribe();
  }

  login() {
    if (this.codeInput().trim().toLowerCase() === HOST_CODE) {
      this.startListening();
    } else {
      this.loginError.set('Código incorreto.');
    }
  }

  revealNextPlace() {
    if (this.revealStep() < 3) this.revealStep.set(this.revealStep() + 1);
  }

  resetReveal() {
    this.revealStep.set(0);
  }

  private async startListening() {
    const state = await this.supabase.getGameState();
    if (state) this.applyState(state);

    this.stateChannel = this.supabase.onGameStateChange((s) => this.applyState(s));
    this.answersChannel = this.supabase.onAnswersChange(() => this.refreshCounts());
    this.playersChannel = this.supabase.onPlayersChange(() => this.refreshCounts());

    await this.refreshCounts();
  }

  private applyState(state: GameState) {
    this.phase.set(state.phase);
    this.currentQuestion.set(state.question_index);
    if (state.phase === 'lobby') this.view.set('lobby');
    else if (state.phase === 'final') {
      this.view.set('final');
      this.refreshBoard();
      this.revealStep.set(0);
    } else this.view.set('question');
    this.refreshCounts();
  }

  private async refreshResponded() {
    const players = await this.supabase.getPlayers();
    const answers = await this.supabase.getAnswersForQuestion(this.currentQuestion());
    const answeredNames = new Set(answers.map((a) => a.player_name));
    const list = players
      .map((p) => ({ name: p.name, answered: answeredNames.has(p.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    this.respondedList.set(list);
  }

  private async refreshCounts() {
    this.playerCount.set(await this.supabase.countPlayers());
    this.answerCount.set(await this.supabase.countAnswersForQuestion(this.currentQuestion()));
    if (this.view() === 'question') this.refreshResponded();
  }

  private score(t: number): number {
    const SPEED_WINDOW = 20000;
    return 1000 + Math.round(500 * Math.max(0, 1 - t / SPEED_WINDOW));
  }

  private async refreshBoard() {
    const rows = await this.supabase.getAllAnswers();
    const totals: Record<string, number> = {};
    for (const row of rows) {
      const correct = this.questions[row.question_index]?.c;
      if (correct === row.choice) {
        totals[row.player_name] = (totals[row.player_name] || 0) + this.score(row.answer_time_ms);
      }
    }
    const board = Object.entries(totals)
      .map(([name, points]) => ({ name, points }))
      .sort((a, b) => b.points - a.points);
    this.board.set(board);
  }

  async startQuiz() {
    await this.supabase.setGameState({
      phase: 'q',
      question_index: 0,
      started_at: new Date().toISOString(),
    });
  }

  async reveal() {
    await this.supabase.setGameState({ phase: 'reveal' });
  }

  async next() {
    const nextIndex = this.currentQuestion() + 1;
    if (nextIndex < this.questions.length) {
      await this.supabase.setGameState({ phase: 'q', question_index: nextIndex });
    } else {
      await this.supabase.setGameState({ phase: 'final' });
    }
  }

  async resetAll() {
    if (!confirm('Apagar todos os jogadores e respostas? Use só antes do evento, em teste.'))
      return;
    await this.supabase.resetGame();
    this.view.set('lobby');
  }
}
