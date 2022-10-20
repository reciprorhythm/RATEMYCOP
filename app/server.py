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
    _tablename_= 'reports'
    postID = db.Column (db.Integer, primary_key=True)
    postTime = db.Column (db.Text)
    title = db.Column (db.String(150), nullable=False) 
    datetime = db.Column (db.Text(150), nullable=False)
    location = db.Column (db.String(150), nullable=False)
    eviUp = db.Column (db.String(200), nullable=False) 
    descrip = db.Column (db.String(1500), nullable=False)
    cw = db.Column (db.String(150), nullable=True)
    escDesc = db.Column (db.String(100), nullable=True)
    copTag = db.Column (db.String(100))
    depTag = db.Column (db.String(100)) 

    def __init__(self, postID, postTime, title, datetime, location, eviUp, descrip, cw, escDesc, copTag, depTag):
        self.postId = postID
        self.postTime = postTime
        self.title = title
        self.datetime = datetime
        self.location = location
        self.eviUp = eviUp
        self.descrip = descrip
        self.cw = cw
        self.escDesc = escDesc
        self.copTag = copTag
        self.depTag = depTag

    def to_dict(self):
        return {
            'postID': self.postID,
            'postTime': self.postTime,
            'title': self.title,
            'datetime': self.datetime,
            'location': self.location,
            'eviUp': self.eviUp,
            'descrip': self.descrip,
            'cw': self.cw,
            'escDesc': self.escDesc,
            'copTag': self.copTag,
            'depTag': self.depTag,
        }

######ROUTES ROUTES ROUTES#######

@app.shell_context_processor
def make_shell_context():
    return {'db': db, 'Cops': Cops, 'Reports': Reports}

@app.route('/')
def index():
    return render_template('base.html', title="RATEMYCOP.CA")

@app.route('/api/data')
def data():
    return {'data': [cops.to_dict() for cops in Cops.query]}

@app.route('/api/repo') 
def repo():
    return {'repo': [reports.to_dict() for reports in Reports.query]}

@app.route('/coplist')
def coplist():
    return render_template('coplist.html', title='PIGS')

@app.route('/reports')
def reports():
    return render_template('reports.html')
    #make reports page links to posts, format them like blogg posts not datatable?
    #return to Micheal!!

@app.route('/submit', methods=['GET', 'POST'])
def submit():
    form = ReportForm()
    if form.validate_on_submit():
        file = request.files['eviUp']
        filename = secure_filename(file.filename) 
        file.save(os.path.join(app.config['UPLOADS_FOLDER'], filename))

        reportdata = Reports(request.form['postID'], request.form['postTime'], request.form['title'], request.form['datetime'], request.form['location'], filename, request.form['descrip'], request.form['cw'], request.form['escDesc'], request.form['copTag'], request.form['depTag'])
        record = reportdata
        db.session.add(record)
        db.session.commit()
        flash('success')
        return redirect('reports')
        # update database fields, validators and ensure code is nice
    else:
        for field, errors in form.errors.items():
            for error in errors:
                flash("Error in {}: {}".format(
                    getattr(form, field).label.text,
                    error
                ), 'error')
        return render_template('submit.html', title='Submit Report', form=form)


if __name__ == "__main__":
    app.debug = True
    app.run(host="localhost", port=5000)






