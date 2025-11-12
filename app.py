from flask import Flask, render_template, request, jsonify, session, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
import os
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
import re

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-key-change-in-production')

# Configuração do Banco de Dados - SQLite como fallback
database_url = os.environ.get('DATABASE_URL')
if database_url and database_url.startswith('mysql'):
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
else:
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///instance/mapa_violeta.db'

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Por favor, faça login para acessar esta página.'

# Modelos (mantenha os mesmos modelos que já estão no seu código)
class Usuario(UserMixin, db.Model):
    __tablename__ = 'usuarios'
    id = db.Column(db.Integer, primary_key=True)
    nick_usuario = db.Column(db.String(50), unique=True, nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    senha_hash = db.Column(db.String(255), nullable=False)
    foto_perfil = db.Column(db.String(255), default='/static/images/avatar_padrao.png')
    pronomes = db.Column(db.String(20))
    is_admin = db.Column(db.Boolean, default=False)
    online = db.Column(db.Boolean, default=False)
    ultima_visualizacao = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, password):
        self.senha_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.senha_hash, password)

class MapaRegistro(db.Model):
    __tablename__ = 'mapa_registros'
    id = db.Column(db.Integer, primary_key=True)
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=False)
    tipo_registro = db.Column(db.String(50), nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    cnv_observacao = db.Column(db.Text, nullable=False)
    cnv_sentimento = db.Column(db.Text)
    cnv_necessidade = db.Column(db.Text)
    cnv_pedido = db.Column(db.Text)
    descricao_adicional = db.Column(db.Text)
    data_evento_ocorrido = db.Column(db.DateTime)
    data_registro = db.Column(db.DateTime, default=datetime.utcnow)
    
    usuario = db.relationship('Usuario', backref=db.backref('registros_mapa', lazy=True))

class MapaComentario(db.Model):
    __tablename__ = 'mapa_comentarios'
    id = db.Column(db.Integer, primary_key=True)
    registro_id = db.Column(db.Integer, db.ForeignKey('mapa_registros.id'), nullable=False)
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=False)
    texto_comentario = db.Column(db.Text, nullable=False)
    data_comentario = db.Column(db.DateTime, default=datetime.utcnow)
    
    registro = db.relationship('MapaRegistro', backref=db.backref('comentarios', lazy=True))
    usuario = db.relationship('Usuario', backref=db.backref('comentarios_mapa', lazy=True))

@login_manager.user_loader
def load_user(user_id):
    return Usuario.query.get(int(user_id))

# Função para criar tabelas se não existirem
def criar_tabelas_se_necessario():
    try:
        with app.app_context():
            # Verifica se a tabela usuarios existe
            insp = db.inspect(db.engine)
            if 'usuarios' not in insp.get_table_names():
                print("📦 Criando tabelas do banco de dados...")
                db.create_all()
                print("✅ Tabelas criadas com sucesso!")
                
                # Criar usuário admin padrão
                admin_user = Usuario.query.filter_by(email='admin@mapavioleta.com').first()
                if not admin_user:
                    admin_user = Usuario(
                        nick_usuario='admin',
                        email='admin@mapavioleta.com',
                        pronomes='ele/dele',
                        is_admin=True
                    )
                    admin_user.set_password('admin123')
                    db.session.add(admin_user)
                    db.session.commit()
                    print("✅ Usuário admin criado: admin@mapavioleta.com / admin123")
            else:
                print("✅ Tabelas já existem no banco de dados")
    except Exception as e:
        print(f"❌ Erro ao criar tabelas: {e}")

# Executar a criação de tabelas quando o app iniciar
criar_tabelas_se_necessario()

# Funções auxiliares (mantenha as mesmas)
def formatar_data_tempo_decorrido(data):
    if not data:
        return ""
    agora = datetime.utcnow()
    diferenca = agora - data
    if diferenca.days > 365:
        return f"há {diferenca.days // 365} ano(s)"
    elif diferenca.days > 30:
        return f"há {diferenca.days // 30} mês(es)"
    elif diferenca.days > 0:
        return f"há {diferenca.days} dia(s)"
    elif diferenca.seconds > 3600:
        return f"há {diferenca.seconds // 3600} hora(s)"
    elif diferenca.seconds > 60:
        return f"há {diferenca.seconds // 60} minuto(s)"
    else:
        return "agora mesmo"

def validar_email(email):
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def validar_senha(senha):
    if len(senha) < 6:
        return False, "A senha deve ter pelo menos 6 caracteres"
    return True, ""

# Rotas principais (mantenha todas as rotas existentes)
@app.route('/')
def index():
    if current_user.is_authenticated:
        return render_template('index.html', usuario=current_user)
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
        
    if request.method == 'POST':
        email = request.form.get('email', '').strip()
        senha = request.form.get('senha', '')
        
        if not email or not senha:
            flash('Por favor, preencha todos os campos.', 'error')
            return render_template('login.html')
        
        usuario = Usuario.query.filter_by(email=email).first()
        
        if usuario and usuario.check_password(senha):
            login_user(usuario)
            usuario.online = True
            usuario.ultima_visualizacao = datetime.utcnow()
            db.session.commit()
            
            next_page = request.args.get('next')
            return redirect(next_page or url_for('index'))
        else:
            flash('Email ou senha incorretos.', 'error')
    
    return render_template('login.html')

@app.route('/cadastro', methods=['GET', 'POST'])
def cadastro():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
        
    if request.method == 'POST':
        nick = request.form.get('nick', '').strip()
        email = request.form.get('email', '').strip()
        pronomes = request.form.get('pronomes', '').strip()
        senha = request.form.get('senha', '')
        confirmar_senha = request.form.get('confirmar_senha', '')
        
        # Validações
        if not all([nick, email, senha, confirmar_senha]):
            flash('Por favor, preencha todos os campos obrigatórios.', 'error')
            return render_template('cadastro.html')
            
        if senha != confirmar_senha:
            flash('As senhas não coincidem.', 'error')
            return render_template('cadastro.html')
            
        if not validar_email(email):
            flash('Por favor, insira um email válido.', 'error')
            return render_template('cadastro.html')
            
        senha_valida, mensagem_erro = validar_senha(senha)
        if not senha_valida:
            flash(mensagem_erro, 'error')
            return render_template('cadastro.html')
        
        # Verificar se email ou nick já existem
        if Usuario.query.filter_by(email=email).first():
            flash('Este email já está cadastrado.', 'error')
            return render_template('cadastro.html')
            
        if Usuario.query.filter_by(nick_usuario=nick).first():
            flash('Este nick já está em uso.', 'error')
            return render_template('cadastro.html')
        
        # Criar novo usuário
        try:
            novo_usuario = Usuario(
                nick_usuario=nick,
                email=email,
                pronomes=pronomes
            )
            novo_usuario.set_password(senha)
            
            db.session.add(novo_usuario)
            db.session.commit()
            
            flash('Cadastro realizado com sucesso! Faça login para continuar.', 'success')
            return redirect(url_for('login'))
            
        except Exception as e:
            db.session.rollback()
            flash('Erro ao criar conta. Tente novamente.', 'error')
    
    return render_template('cadastro.html')

# Mantenha todas as outras rotas API existentes...
@app.route('/logout')
@login_required
def logout():
    current_user.online = False
    db.session.commit()
    logout_user()
    flash('Você saiu da sua conta.', 'info')
    return redirect(url_for('login'))

@app.route('/api/mapa-violeta/get-pontos-mapa')
@login_required
def get_pontos_mapa():
    try:
        filtro_tipo = request.args.get('filtro_tipo_registro')
        filtro_usuario = request.args.get('filtro_usuario')
        filtro_data_de = request.args.get('filtro_data_de')
        filtro_data_ate = request.args.get('filtro_data_ate')
        filtro_termo = request.args.get('filtro_termo')
        
        query = MapaRegistro.query.join(Usuario)
        
        if filtro_tipo:
            query = query.filter(MapaRegistro.tipo_registro == filtro_tipo)
        if filtro_usuario:
            query = query.filter(Usuario.nick_usuario.like(f'%{filtro_usuario}%'))
        if filtro_data_de:
            query = query.filter(MapaRegistro.data_evento_ocorrido >= filtro_data_de)
        if filtro_data_ate:
            query = query.filter(MapaRegistro.data_evento_ocorrido <= filtro_data_ate)
        if filtro_termo:
            termo_like = f'%{filtro_termo}%'
            query = query.filter(
                db.or_(
                    MapaRegistro.cnv_observacao.like(termo_like),
                    MapaRegistro.cnv_pedido.like(termo_like),
                    MapaRegistro.descricao_adicional.like(termo_like)
                )
            )
        
        registros = query.all()
        
        resultado = []
        for registro in registros:
            resultado.append({
                'id': registro.id,
                'tipo_registro': registro.tipo_registro,
                'latitude': registro.latitude,
                'longitude': registro.longitude,
                'cnv_observacao': registro.cnv_observacao,
                'cnv_sentimento': registro.cnv_sentimento,
                'cnv_necessidade': registro.cnv_necessidade,
                'cnv_pedido': registro.cnv_pedido,
                'descricao_adicional': registro.descricao_adicional,
                'data_evento_ocorrido': registro.data_evento_ocorrido.isoformat() if registro.data_evento_ocorrido else None,
                'data_registro': registro.data_registro.isoformat(),
                'usuario_id': registro.usuario_id,
                'nick_usuario': registro.usuario.nick_usuario,
                'foto_perfil_usuario': registro.usuario.foto_perfil or '/static/images/avatar_padrao.png',
                'pronomes_usuario': registro.usuario.pronomes
            })
        
        return jsonify({'success': True, 'data': resultado})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Mantenha todas as outras rotas API...
@app.route('/api/mapa-violeta/registrar-ponto-mapa', methods=['POST'])
@login_required
def registrar_ponto_mapa():
    try:
        action = request.form.get('action')
        
        if action == 'criar':
            registro = MapaRegistro(
                usuario_id=current_user.id,
                tipo_registro=request.form.get('tipo_registro'),
                latitude=float(request.form.get('latitude')),
                longitude=float(request.form.get('longitude')),
                cnv_observacao=request.form.get('observacao'),
                cnv_sentimento=request.form.get('sentimento'),
                cnv_necessidade=request.form.get('necessidade'),
                cnv_pedido=request.form.get('pedido'),
                descricao_adicional=request.form.get('descricao_adicional'),
                data_evento_ocorrido=request.form.get('data_evento_ocorrido')
            )
            db.session.add(registro)
            db.session.commit()
            
            return jsonify({'success': True, 'mensagem': 'Registro criado com sucesso!'})
            
        elif action == 'editar':
            registro_id = request.form.get('registro_id_editar')
            registro = MapaRegistro.query.get(registro_id)
            
            if registro and (registro.usuario_id == current_user.id or current_user.is_admin):
                registro.tipo_registro = request.form.get('tipo_registro')
                registro.cnv_observacao = request.form.get('observacao')
                registro.cnv_sentimento = request.form.get('sentimento')
                registro.cnv_necessidade = request.form.get('necessidade')
                registro.cnv_pedido = request.form.get('pedido')
                registro.descricao_adicional = request.form.get('descricao_adicional')
                registro.data_evento_ocorrido = request.form.get('data_evento_ocorrido')
                
                db.session.commit()
                return jsonify({'success': True, 'mensagem': 'Registro atualizado com sucesso!'})
            else:
                return jsonify({'success': False, 'mensagem': 'Não autorizado'}), 403
                
        elif action == 'apagar':
            registro_id = request.form.get('registro_id_apagar')
            registro = MapaRegistro.query.get(registro_id)
            
            if registro and (registro.usuario_id == current_user.id or current_user.is_admin):
                db.session.delete(registro)
                db.session.commit()
                return jsonify({'success': True, 'mensagem': 'Registro apagado com sucesso!'})
            else:
                return jsonify({'success': False, 'mensagem': 'Não autorizado'}), 403
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/mapa-violeta/get-mapa-comentarios')
@login_required
def get_mapa_comentarios():
    try:
        registro_id = request.args.get('registro_id')
        comentarios = MapaComentario.query.filter_by(registro_id=registro_id).join(Usuario).all()
        
        resultado = []
        for comentario in comentarios:
            resultado.append({
                'id': comentario.id,
                'texto_comentario': comentario.texto_comentario,
                'data_comentario': comentario.data_comentario.isoformat(),
                'usuario_id': comentario.usuario_id,
                'nick_usuario': comentario.usuario.nick_usuario,
                'foto_perfil_usuario': comentario.usuario.foto_perfil or '/static/images/avatar_padrao.png',
                'pronomes_usuario': comentario.usuario.pronomes
            })
        
        return jsonify({'success': True, 'comentarios': resultado})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/mapa-violeta/registrar-mapa-comentario', methods=['POST'])
@login_required
def registrar_mapa_comentario():
    try:
        registro_id = request.form.get('registro_id')
        texto = request.form.get('texto_comentario_mapa')
        
        comentario = MapaComentario(
            registro_id=registro_id,
            usuario_id=current_user.id,
            texto_comentario=texto
        )
        db.session.add(comentario)
        db.session.commit()
        
        return jsonify({'success': True, 'mensagem': 'Comentário adicionado!'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/mapa-violeta/update-user-location', methods=['POST'])
@login_required
def update_user_location():
    try:
        current_user.ultima_visualizacao = datetime.utcnow()
        current_user.online = True
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/mapa-violeta/get-users-locations')
@login_required
def get_users_locations():
    try:
        cinco_minutos_atras = datetime.utcnow().timestamp() - 300
        usuarios_online = Usuario.query.filter(
            Usuario.online == True,
            db.func.unix_timestamp(Usuario.ultima_visualizacao) > cinco_minutos_atras
        ).all()
        
        resultado = []
        for usuario in usuarios_online:
            if usuario.id != current_user.id:
                resultado.append({
                    'id': usuario.id,
                    'nick_usuario': usuario.nick_usuario,
                    'foto_perfil_usuario': usuario.foto_perfil or '/static/images/avatar_padrao.png',
                    'pronomes_usuario': usuario.pronomes,
                    'online': usuario.online,
                    'ultima_visualizacao': usuario.ultima_visualizacao.isoformat() if usuario.ultima_visualizacao else None
                })
        
        return jsonify({'success': True, 'users': resultado})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/perfil')
@login_required
def perfil():
    return render_template('perfil.html', usuario=current_user)

if __name__ == '__main__':
    app.run(debug=os.environ.get('DEBUG', False), host='0.0.0.0', port=5000)
