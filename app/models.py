import uuid
from datetime import datetime, timedelta
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from sqlalchemy.dialects.postgresql import UUID, JSONB

db = SQLAlchemy()


def gen_uuid():
    return str(uuid.uuid4())


class User(db.Model, UserMixin):
    __tablename__ = "users"

    id = db.Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)

    # Google OAuth orqali keladigan ma'lumotlar
    google_sub = db.Column(db.String(255), unique=True, nullable=False, index=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    full_name = db.Column(db.String(255), nullable=False)
    avatar_url = db.Column(db.Text)

    # Foydalanuvchi o'zi to'ldiradigan profil ma'lumotlari
    username = db.Column(db.String(80), unique=True, nullable=True)
    bio = db.Column(db.String(280), nullable=True)
    location_city = db.Column(db.String(120), nullable=True)
    location_country = db.Column(db.String(120), nullable=True)

    # JSONB: {"telegram": "...", "github": "...", "instagram": "...", "portfolio": "..."}
    social_links = db.Column(JSONB, default=dict, server_default="{}")

    total_listens = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    audio_posts = db.relationship(
        "AudioPost", backref="author", lazy="dynamic", cascade="all, delete-orphan"
    )

    @property
    def is_profile_complete(self):
        """Audio joylashdan oldin bio/username to'ldirilganini tekshirish uchun"""
        return bool(self.username and self.bio)

    def to_public_dict(self, current_user_id=None):
        """Public Profile Card uchun - boshqa foydalanuvchilar ko'radigan ma'lumot"""
        active_posts = self.audio_posts.filter_by(is_active=True).order_by(
            AudioPost.created_at.desc()
        ).all()
        return {
            "id": self.id,
            "full_name": self.full_name,
            "username": self.username,
            "avatar_url": self.avatar_url,
            "bio": self.bio,
            "location_city": self.location_city,
            "location_country": self.location_country,
            "social_links": self.social_links or {},
            "total_listens": self.total_listens,
            "active_posts": [p.to_dict(current_user_id) for p in active_posts],
        }


class Reaction(db.Model):
    __tablename__ = "reactions"
    __table_args__ = (
        db.UniqueConstraint("post_id", "user_id", name="uq_reaction_post_user"),
    )

    id = db.Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    post_id = db.Column(UUID(as_uuid=False), db.ForeignKey("audio_posts.id"), nullable=False)
    user_id = db.Column(UUID(as_uuid=False), db.ForeignKey("users.id"), nullable=False)

    # Bitta foydalanuvchi bitta postga faqat bitta emoji bilan reaksiya bera oladi
    # (qayta bossa - yangilanadi yoki o'chiriladi)
    emoji = db.Column(db.String(8), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class AudioPost(db.Model):
    __tablename__ = "audio_posts"

    id = db.Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = db.Column(UUID(as_uuid=False), db.ForeignKey("users.id"), nullable=False)

    # post_type: "audio" yoki "text". Ikkalasi ham shu jadvalda saqlanadi -
    # xaritada ikkalasi ham bir xil nuqta, faqat ichidagi kontent turi farqlanadi.
    post_type = db.Column(db.String(10), nullable=False, default="audio")

    audio_url = db.Column(db.Text, nullable=True)   # post_type == "audio" bo'lsa to'ldiriladi
    text_content = db.Column(db.String(500), nullable=True)  # post_type == "text" bo'lsa to'ldiriladi
    duration = db.Column(db.Integer)  # faqat audio uchun, soniyalarda, max 15s

    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)

    listens_count = db.Column(db.Integer, default=0)  # matn uchun "ko'rilishlar" sifatida ham ishlatiladi
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    reactions = db.relationship("Reaction", backref="post", lazy="dynamic", cascade="all, delete-orphan")

    def to_dict(self, current_user_id=None):
        # Reaksiyalarni emoji bo'yicha guruhlab sanash: {"🔥": 3, "❤️": 5}
        reaction_rows = self.reactions.all()
        summary = {}
        my_reaction = None
        for r in reaction_rows:
            summary[r.emoji] = summary.get(r.emoji, 0) + 1
            if current_user_id and r.user_id == current_user_id:
                my_reaction = r.emoji

        return {
            "id": self.id,
            "post_type": self.post_type,
            "audio_url": self.audio_url,
            "text_content": self.text_content,
            "duration": self.duration,
            "lat": self.lat,
            "lng": self.lng,
            "listens_count": self.listens_count,
            "created_at": self.created_at.isoformat(),
            "reactions": summary,
            "my_reaction": my_reaction,
            "author": {
                "id": self.author.id,
                "full_name": self.author.full_name,
                "username": self.author.username,
                "avatar_url": self.author.avatar_url,
            },
        }

    def to_map_marker(self):
        """Xaritada nuqta sifatida ko'rsatish uchun yengil format"""
        return {
            "id": self.id,
            "post_type": self.post_type,
            "lat": self.lat,
            "lng": self.lng,
            "author_avatar": self.author.avatar_url,
            "author_name": self.author.full_name,
            # matn nuqtalarini boshqa rangda chizish uchun frontendga signal
            "preview": (self.text_content[:40] if self.post_type == "text" else None),
        }
