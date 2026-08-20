import uuid
from datetime import datetime, timedelta, timezone
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from sqlalchemy.dialects.postgresql import UUID, JSONB

db = SQLAlchemy()


def gen_uuid():
    return str(uuid.uuid4())


class User(db.Model, UserMixin):
    __tablename__ = "users"

    id = db.Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)

    # Data coming from Google OAuth
    google_sub = db.Column(db.String(255), unique=True, nullable=False, index=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    full_name = db.Column(db.String(255), nullable=False)
    avatar_url = db.Column(db.Text)

    # Profile fields filled in by the user themselves
    username = db.Column(db.String(80), unique=True, nullable=True)
    bio = db.Column(db.String(200), nullable=True)
    location_city = db.Column(db.String(120), nullable=True)
    location_country = db.Column(db.String(120), nullable=True)

    # Home coordinates, derived from the country/region chosen at signup.
    # Posts are placed here automatically instead of the user manually
    # dropping a pin on the globe.
    home_lat = db.Column(db.Float, nullable=True)
    home_lng = db.Column(db.Float, nullable=True)

    # JSONB: {"telegram": "...", "github": "...", "instagram": "...", "portfolio": "..."}
    social_links = db.Column(JSONB, default=dict, server_default="{}")

    total_listens = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    audio_posts = db.relationship(
        "AudioPost", backref="author", lazy="dynamic", cascade="all, delete-orphan"
    )

    @property
    def is_profile_complete(self):
        """Checked before a user is allowed to publish a post"""
        return bool(
            self.username and self.bio and self.location_country
            and self.home_lat is not None and self.home_lng is not None
        )

    def _clean_social_links(self):
        sl = dict(self.social_links or {})
        tg = sl.get("telegram", "")
        if tg:
            sl["telegram"] = tg.replace("t.me/@", "t.me/").lstrip("@")
        return sl

    def to_public_dict(self, current_user_id=None):
        """What other users see on this user's public profile card"""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        active_posts = self.audio_posts.filter(
            AudioPost.is_active == True,
            AudioPost.created_at >= cutoff,
        ).order_by(AudioPost.created_at.desc()).all()
        all_posts = self.audio_posts.filter_by(is_active=True).order_by(
            AudioPost.created_at.desc()
        ).all()
        total_count = self.audio_posts.filter_by(is_active=True).count()
        return {
            "id": self.id,
            "full_name": self.full_name,
            "username": self.username,
            "avatar_url": self.avatar_url,
            "bio": self.bio,
            "location_city": self.location_city,
            "location_country": self.location_country,
            "social_links": self._clean_social_links(),
            "total_posts_count": total_count,
            "active_posts_count": len(active_posts),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "active_posts": [p.to_dict(current_user_id) for p in active_posts],
            "all_posts": [p.to_dict(current_user_id) for p in all_posts],
        }


class AudioPost(db.Model):
    __tablename__ = "audio_posts"

    id = db.Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = db.Column(UUID(as_uuid=False), db.ForeignKey("users.id"), nullable=False)

    # post_type: "audio" or "text". Both are stored in the same table —
    # on the map they render as the same kind of marker, only the content differs.
    post_type = db.Column(db.String(10), nullable=False, default="audio")

    audio_url = db.Column(db.Text, nullable=True)   # set when post_type == "audio"
    text_content = db.Column(db.String(500), nullable=True)  # set when post_type == "text"
    duration = db.Column(db.Integer)  # audio only, in seconds, max 15s

    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)

    listens_count = db.Column(db.Integer, default=0)  # also used as "views" for text posts
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self, current_user_id=None):
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
            "author": {
                "id": self.author.id,
                "full_name": self.author.full_name,
                "username": self.author.username,
                "avatar_url": self.author.avatar_url,
            },
        }

    def to_map_marker(self):
        """Lightweight format used to render markers on the globe"""
        return {
            "id": self.id,
            "post_type": self.post_type,
            "lat": self.lat,
            "lng": self.lng,
            "author_id": self.author.id,
            "author_avatar": self.author.avatar_url,
            "author_name": self.author.full_name,
            "author_city": self.author.location_city or '',
            "text_content": self.text_content if self.post_type == "text" else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }