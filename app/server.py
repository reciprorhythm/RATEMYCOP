from flask import Flask, render_template, flash, redirect, request, url_for
from config import Config
from forms import ReportForm
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from datetime import date
from werkzeug.utils import secure_filename
import os
import sqlite3

app = Flask(__name__)
app.config.from_object(Config)
db = SQLAlchemy(app)
migrate = Migrate(app, db)

#####MODELS MODELS MODELS#######

class Cops(db.Model):  
    _tablename_ = 'cops'
    copID = db.Column (db.Integer, primary_key=True)
    lastN = db.Column (db.String(100), nullable=False)
    firstN = db.Column (db.String(100), nullable=True)
    rank = db.Column (db.String(100), nullable=True)
    dept = db.Column (db.String(100), nullable=False)
    sal = db.Column (db.Integer, nullable=True)

    def to_dict(self):
        return {
            'copID': self.copID,
            'lastN': self.lastN,
            'firstN': self.firstN,
            'rank': self.rank,
            'dept': self.dept,
            'sal': self.sal,
        }

class Reports(db.Model):
    _tablename_ = 'reports'
    repoID = db.Column(db.Integer, primary_key=True)
    repoTitle = db.Column(db.String(150), nullable=False)
    repoLoca = db.Column(db.String(150), nullable=True)
    repoCont = db.Column(db.String(500), nullable=False)
    repoTime = db.Column(db.Text(150), nullable=False)
    repoCop = db.Column(db.String(150), nullable=True)

    def to_dict(self):
        return {
            'repoID': self.repoID,
            'repoTitle': self.repoTitle,
            'repoLoca': self.repoLoca,
            'repoCont': self.repoCont,
            'repoTime': self.repoTime,
            'repoCop': self.repoCop,
        }

    
####ROUTES ROUTES ROUTES#######

@app.shell_context_processor
def make_shell_context():
    return {'db': db, 'Cops': Cops, 'Reports': Reports}

@app.route('/')
def index():
    return render_template('base.html', title="RATEMYCOP.CA")

@app.route('/api/data')
def data():
    return {'data': [cops.to_dict() for cops in Cops.query]}

@app.route('/api/reporoute')
def reporoute():
    return {'data': [reports.to_dict() for reports in Reports.query]}

@app.route('/coplist')
def coplist():
    return render_template('coplist.html')

@app.route('/reports')
def repolist():
    return render_template('reports.html')

@app.route('/cop/<copID>', methods=['GET', 'POST'])
def cop(copID):
    cop = Cops.query.filter_by(copID=copID).first_or_404()
    repo = Reports.query.filter_by(repoCop=copID).all()
    form = ReportForm()
    if form.validate_on_submit():
        repodata = Reports(repoTitle=form.repoTitle.data, repoLoca=form.repoLoca.data, repoCont=form.repoCont.data, repoTime=form.repoTime.data, repoCop=copID)
        record = repodata
        db.session.add(record)
        db.session.commit()
        flash('success')
    else:
        for field, errors in form.errors.items():
            for error in errors:
                flash("Error in {}: {}".format(
                getattr(form, field).label.text,
                    error
                ), 'error')
    return render_template('cop.html', cop=cop, form=form, repo=repo)


if __name__ == "__main__":
    app.debug = True
    app.run(host="localhost", port=5000)






